import type { FastifyInstance } from 'fastify';
import { one, q } from './db.js';
import { config } from './config.js';
import {
  HttpError, canPresent, createLink, endSession, hashPassword, isStaff, lookupLink, need, publicUser,
  safeEqual, startSession, verifyPassword, type UserRow,
} from './auth.js';
import {
  classDeck, getModule, lessonsFor, modulesForRole, moduleSlides, needsAnswers, pathsForRole, paths, publicModule, quizFor,
} from './content.js';
import { GROUPS } from '../shared/types.js';
import { liveClassesFor } from './live.js';
import { maybeIssue } from './certificates.js';
import { PASS, TEST_OUT } from './progress.js';
import { activeProgram, dueDates, signoffItems, sydneyToday, weekOf } from './program.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isAdmin = (u: UserRow) => u.is_admin;

// ---- brute-force protection: counts FAILED attempts only (in memory, 15-minute window) ----
// Successful sign-ins never count, so a whole team signing up on the office Wi-Fi isn't blocked.
const failures = new Map<string, { n: number; until: number }>();
function checkLimit(key: string, max: number) {
  const a = failures.get(key);
  if (a && a.until > Date.now() && a.n >= max) throw new HttpError(429, 'Too many attempts. Wait 15 minutes and try again.');
}
function recordFailure(...keys: string[]) {
  const now = Date.now();
  if (failures.size > 10000) for (const [k, v] of failures) if (v.until < now) failures.delete(k);
  for (const key of keys) {
    const a = failures.get(key);
    if (!a || a.until < now) failures.set(key, { n: 1, until: now + 15 * 60 * 1000 });
    else a.n++;
  }
}

// ---- progress ----
type Entry = { lessons: number; passed: boolean; attempts: number; best: number | null };
export async function progressFor(userIds: string[]) {
  const map = new Map<string, Map<string, Entry>>();
  const get = (u: string, m: string) => {
    if (!map.has(u)) map.set(u, new Map());
    const um = map.get(u)!;
    if (!um.has(m)) um.set(m, { lessons: 0, passed: false, attempts: 0, best: null });
    return um.get(m)!;
  };
  if (!userIds.length) return map;
  for (const r of await q(`select user_id, module_id, count(*)::int n from lesson_progress where user_id = any($1) group by 1, 2`, [userIds]))
    get(r.user_id, r.module_id).lessons = r.n;
  for (const r of await q(
    `select user_id, module_id, bool_or(passed) passed, count(*)::int n, max(score)::int best
       from quiz_attempts where user_id = any($1) group by 1, 2`, [userIds]))
    Object.assign(get(r.user_id, r.module_id), { passed: r.passed, attempts: r.n, best: r.best });
  return map;
}

export function moduleStatus(moduleId: string, e: Entry | undefined): 'done' | 'started' | 'none' {
  const hit = getModule(moduleId);
  if (!hit || !e) return 'none';
  const quizLength = quizFor(moduleId).length;
  if (e.lessons >= hit.module.lessons.length && (quizLength === 0 || e.passed)) return 'done';
  return e.lessons > 0 || e.attempts > 0 ? 'started' : 'none';
}

async function markLessons(userId: string, moduleId: string, source: string) {
  const hit = getModule(moduleId);
  if (!hit) return;
  await q(
    `insert into lesson_progress (user_id, module_id, lesson_index, source)
     select $1, $2, i, $3 from generate_series(0, $4 - 1) i
     on conflict do nothing`,
    [userId, moduleId, source, hit.module.lessons.length],
  );
}

export async function registerRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------------ auth
  app.get('/api/auth/me', async (req) => {
    if (!req.user) return { user: null };
    const pu = publicUser(req.user);
    // Supervising techs review their apprentices' sign-offs.
    if (!pu.reviewsSignoffs && (await one(`select 1 from users where supervisor_id = $1 limit 1`, [req.user.id]))) pu.reviewsSignoffs = true;
    return { user: pu };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const b = req.body as any;
    const email = str(b?.email).toLowerCase();
    const password = typeof b?.password === 'string' ? b.password : '';
    const keys = [`login:${req.ip}:${email}`, `login-ip:${req.ip}`];
    checkLimit(keys[0], 8);
    checkLimit(keys[1], 60);
    const u = await one<UserRow>(`select * from users where lower(email) = $1`, [email]);
    if (!u || u.status !== 'active' || !(await verifyPassword(password, u.password_hash))) {
      recordFailure(...keys);
      throw new HttpError(401, 'That email and password combination is not right.');
    }
    await startSession(reply, req, u.id);
    return { user: publicUser(u) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await endSession(reply, req);
    return { ok: true };
  });

  app.get('/api/auth/link/:token', async (req) => {
    checkLimit(`link-bad:${req.ip}`, 30);
    const t = await lookupLink((req.params as any).token);
    if (!t || t.status === 'disabled') {
      recordFailure(`link-bad:${req.ip}`);
      throw new HttpError(404, 'This link has expired or already been used. Ask for a new one.');
    }
    return { kind: t.kind, name: t.name, email: t.email, needsEmail: !t.email };
  });

  app.post('/api/auth/link/:token', async (req, reply) => {
    checkLimit(`link-bad:${req.ip}`, 30);
    const token = (req.params as any).token;
    const t = await lookupLink(token);
    if (!t || t.status === 'disabled') {
      recordFailure(`link-bad:${req.ip}`);
      throw new HttpError(404, 'This link has expired or already been used. Ask for a new one.');
    }
    const b = req.body as any;
    const password = typeof b?.password === 'string' ? b.password : '';
    if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters for your password.');
    let email = t.email;
    if (!email) {
      email = str(b?.email).toLowerCase();
      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address. You will use it to sign in.');
      if (await one(`select 1 from users where lower(email) = $1 and id <> $2`, [email, t.id]))
        throw new HttpError(409, 'That email is already used by another account.');
    }
    await q(`update users set password_hash = $1, email = $2, status = 'active' where id = $3`, [await hashPassword(password), email, t.id]);
    await q(`update auth_tokens set used_at = now() where user_id = $1 and used_at is null`, [t.id]);
    await startSession(reply, req, t.id);
    const u = await one<UserRow>(`select * from users where id = $1`, [t.id]);
    return { user: publicUser(u!) };
  });

  // First admin password, protected by ADMIN_SETUP_CODE. Switches off once any admin has a password.
  async function setupAvailable() {
    if (!config.setupCode) return false;
    return !(await one(`select 1 from users where is_admin and password_hash is not null`));
  }
  app.get('/api/setup', async () => ({ available: await setupAvailable() }));
  app.post('/api/setup', async (req, reply) => {
    checkLimit(`setup:${req.ip}`, 10);
    if (!(await setupAvailable())) throw new HttpError(404, 'Setup is already complete.');
    const b = req.body as any;
    if (!safeEqual(str(b?.code, 200), config.setupCode)) {
      recordFailure(`setup:${req.ip}`);
      throw new HttpError(403, 'That setup code is not right.');
    }
    const email = str(b?.email).toLowerCase();
    const password = typeof b?.password === 'string' ? b.password : '';
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (password.length < 10) throw new HttpError(400, 'Use at least 10 characters for the admin password.');
    const owner = await one<UserRow>(`select * from users where seed_key = 'office:william'`);
    if (!owner) throw new HttpError(500, 'Owner account missing. Run migrations.');
    if (await one(`select 1 from users where lower(email) = $1 and id <> $2`, [email, owner.id]))
      throw new HttpError(409, 'That email is already used by another account.');
    await q(`update users set email = $1, password_hash = $2, status = 'active' where id = $3`, [email, await hashPassword(password), owner.id]);
    await startSession(reply, req, owner.id);
    return { ok: true };
  });

  // ------------------------------------------------------------------ learner
  app.get('/api/me/overview', async (req) => {
    const u = need(req);
    const prog = (await progressFor([u.id])).get(u.id) ?? new Map();
    const myPaths = pathsForRole(u.trade_role).map((p) => ({
      id: p.id, name: p.name, summary: p.summary,
      modules: p.modules.map((m) => ({
        id: m.id, title: m.title, objective: m.objective, lessonCount: m.lessons.length, lessonsWritten: publicModule(m.id)!.lessonsWritten,
        quizLength: quizFor(m.id).length, status: moduleStatus(m.id, prog.get(m.id)),
      })),
    }));
    const all = myPaths.flatMap((p) => p.modules);
    return {
      user: publicUser(u),
      paths: myPaths,
      done: all.filter((m) => m.status === 'done').length,
      total: all.length,
      live: await liveClassesFor(u),
    };
  });

  app.get('/api/modules/:id', async (req) => {
    const u = need(req);
    const id = (req.params as any).id;
    const m = publicModule(id);
    if (!m) throw new HttpError(404, 'Module not found.');
    const e = (await progressFor([u.id])).get(u.id)?.get(id);
    const done = await q<{ lesson_index: number }>(`select lesson_index from lesson_progress where user_id = $1 and module_id = $2`, [u.id, id]);
    const signoffs = await q(
      `select id, item_index, status, job_ref, tech_note, review_note, requested_at, reviewed_at,
              (select count(*)::int from signoff_photos p where p.signoff_id = s.id) photos
         from signoffs s where user_id = $1 and module_id = $2`, [u.id, id]);
    return {
      module: m, status: moduleStatus(id, e), best: e?.best ?? null, attempts: e?.attempts ?? 0, doneLessons: done.map((r) => r.lesson_index),
      signoffs, inMyPath: modulesForRole(u.trade_role).includes(id),
    };
  });

  app.get('/api/modules/:id/lessons/:n', async (req) => {
    const u = need(req);
    const { id, n } = req.params as any;
    const m = publicModule(id);
    const idx = Number(n);
    if (!m || !Number.isInteger(idx) || idx < 0 || idx >= m.lessons.length) throw new HttpError(404, 'Lesson not found.');
    const lesson = lessonsFor(id)?.lessons[idx];
    if (!lesson) throw new HttpError(404, 'This lesson is taught in your live class. The written version is coming.');
    const done = await one(`select 1 from lesson_progress where user_id = $1 and module_id = $2 and lesson_index = $3`, [u.id, id, idx]);
    return {
      moduleId: id, moduleTitle: m.title, pathName: m.pathName, index: idx, total: m.lessons.length,
      written: m.lessonsWritten, title: m.lessons[idx], blocks: lesson.blocks, status: m.lessonStatus, done: !!done,
      quizLength: m.quizLength,
    };
  });

  app.post('/api/modules/:id/lessons/:n/done', async (req) => {
    const u = need(req);
    const { id, n } = req.params as any;
    const m = publicModule(id);
    const idx = Number(n);
    if (!m || !Number.isInteger(idx) || idx < 0 || idx >= m.lessons.length) throw new HttpError(404, 'Lesson not found.');
    await q(`insert into lesson_progress (user_id, module_id, lesson_index, source) values ($1, $2, $3, 'self') on conflict do nothing`, [u.id, id, idx]);
    return { ok: true };
  });

  app.get('/api/modules/:id/quiz', async (req) => {
    need(req);
    const id = (req.params as any).id;
    const quiz = quizFor(id);
    if (!quiz.length) throw new HttpError(404, 'This module has no quiz yet.');
    return { questions: quiz.map((x) => ({ q: x.q, options: x.options })) };
  });

  app.post('/api/modules/:id/quiz', async (req) => {
    const u = need(req);
    const id = (req.params as any).id;
    const quiz = quizFor(id);
    if (!quiz.length) throw new HttpError(404, 'This module has no quiz yet.');
    const answers = Array.isArray((req.body as any)?.answers) ? (req.body as any).answers : [];
    const results = quiz.map((x, i) => ({ chosen: Number.isInteger(answers[i]) ? answers[i] : null, correct: x.correct, why: x.why }));
    const right = results.filter((r) => r.chosen === r.correct).length;
    const score = Math.round((right / quiz.length) * 100);
    const passed = score >= PASS;
    const testedOut = score >= TEST_OUT;
    await q(`insert into quiz_attempts (user_id, module_id, score, passed, answers, source) values ($1, $2, $3, $4, $5, 'self')`,
      [u.id, id, score, passed, JSON.stringify(answers)]);
    if (testedOut) await markLessons(u.id, id, 'testout');
    if (passed) await maybeIssue([u.id]);
    const read = (await one<{ n: number }>(`select count(*)::int n from lesson_progress where user_id = $1 and module_id = $2`, [u.id, id]))!.n;
    const lessonsLeft = Math.max(0, getModule(id)!.module.lessons.length - read);
    return { score, passed, testedOut, lessonsLeft, results };
  });

  app.post('/api/modules/:id/read', async (req) => {
    const u = need(req);
    const id = (req.params as any).id;
    if (!getModule(id)) throw new HttpError(404, 'Module not found.');
    if (quizFor(id).length) throw new HttpError(400, 'Pass the quiz to complete this module.');
    await markLessons(u.id, id, 'self');
    return { ok: true };
  });

  app.get('/api/me/live', async (req) => ({ live: await liveClassesFor(need(req)) }));

  // ------------------------------------------------------------------ admin: meta + content
  app.get('/api/admin/meta', async (req) => {
    need(req, isStaff);
    return {
      groups: GROUPS,
      paths: paths.map((p) => ({ id: p.id, name: p.name, modules: p.modules.map((m) => ({ id: m.id, title: m.title, quizLength: quizFor(m.id).length, lessonCount: m.lessons.length, lessonsWritten: publicModule(m.id)!.lessonsWritten, lessonStatus: lessonsFor(m.id)?.status ?? null })) })),
      schedule: (await import('./content.js')).program.schedule,
    };
  });

  app.get('/api/admin/content/:id/deck', async (req) => {
    need(req, isStaff);
    const id = (req.params as any).id;
    if (!getModule(id)) throw new HttpError(404, 'Module not found.');
    return { module: publicModule(id), deck: moduleSlides(id, true), lessons: lessonsFor(id) };
  });

  app.get('/api/admin/needs-answers', async (req) => {
    need(req, isStaff);
    return { items: needsAnswers() };
  });

  // ------------------------------------------------------------------ admin: dashboard
  app.get('/api/admin/dashboard', async (req) => {
    need(req, isStaff);
    const techs = await q<UserRow>(`select * from users where trade_role is not null order by trade_role, name`);
    const prog = await progressFor(techs.map((t) => t.id));
    const program = await activeProgram();
    const today = sydneyToday();
    const stale = new Map((await q<{ user_id: string; n: number }>(
      `select user_id, count(*)::int n from signoffs where status = 'waiting' and requested_at < now() - interval '7 days' group by 1`))
      .map((r) => [r.user_id, r.n]));
    const signoffCounts = new Map((await q<{ user_id: string; approved: number; waiting: number }>(
      `select user_id, count(*) filter (where status = 'approved')::int approved, count(*) filter (where status = 'waiting')::int waiting
         from signoffs group by 1`)).map((r) => [r.user_id, r]));
    const week = 7 * 86400 * 1000;
    const rows = techs.map((t) => {
      const ids = modulesForRole(t.trade_role);
      const p = prog.get(t.id);
      const modules: Record<string, string> = {};
      for (const id of ids) modules[id] = moduleStatus(id, p?.get(id));
      const failedTwice = ids.filter((id) => {
        const e = p?.get(id);
        return e && !e.passed && e.attempts >= 2;
      });
      const flags: string[] = [];
      if (t.status === 'invited') flags.push('Not signed up yet');
      else if (t.status === 'disabled') flags.push('Disabled');
      else if (!t.last_seen_at || Date.now() - new Date(t.last_seen_at).getTime() > week) flags.push('Inactive 7+ days');
      if (failedTwice.length) flags.push(`Failed a quiz twice (${failedTwice.join(', ')})`);
      const due = program ? dueDates(program, t.trade_role) : new Map();
      const overdue = [...due.entries()].filter(([id, d]) => d.due < today && modules[id] !== 'done').map(([id]) => id);
      if (overdue.length && t.status !== 'disabled') flags.push(`Behind: ${overdue.length} module${overdue.length > 1 ? 's' : ''} overdue`);
      if (stale.get(t.id)) flags.push(`Sign-off waiting 7+ days (${stale.get(t.id)})`);
      const sc = signoffCounts.get(t.id);
      const signoffTotal = ids.reduce((n, id) => n + signoffItems(id).length, 0);
      return {
        overdue, signoffs: { approved: sc?.approved ?? 0, waiting: sc?.waiting ?? 0, total: signoffTotal },
        id: t.id, name: t.name, tradeRole: t.trade_role, group: t.training_group, status: t.status,
        isApprentice: t.is_apprentice, lastSeenAt: t.last_seen_at, modules,
        done: Object.values(modules).filter((s) => s === 'done').length, total: ids.length, flags,
      };
    });
    const columns: Record<string, Array<{ id: string; title: string }>> = {};
    for (const role of ['install', 'service', 'salestech'])
      columns[role] = pathsForRole(role).flatMap((p) => p.modules.map((m) => ({ id: m.id, title: m.title })));
    const classes = await q(
      `select id, title, group_id, status, scheduled_at, started_at, join_code from classes
        where status = 'live' or (status = 'scheduled' and (scheduled_at is null or scheduled_at > now() - interval '1 day'))
        order by status desc, scheduled_at nulls last limit 8`,
    );
    const waiting = (await one<{ n: number }>(`select count(*)::int n from signoffs where status = 'waiting'`))!.n;
    return {
      techs: rows, columns, classes, signoffsWaiting: waiting,
      program: program ? { name: program.name, startDate: program.start_date, week: weekOf(program, today), weeks: program.schedule.length } : null,
    };
  });

  // ------------------------------------------------------------------ admin: users
  app.get('/api/admin/users', async (req) => {
    need(req, isStaff);
    const rows = await q<UserRow>(`select * from users order by (trade_role is null), trade_role, name`);
    return { users: rows.map(publicUser) };
  });

  const FLAG_KEYS: Record<string, string> = {
    isAdmin: 'is_admin', isOffice: 'is_office', isTrainer: 'is_trainer', isAssessor: 'is_assessor', isLeadTech: 'is_lead_tech', isApprentice: 'is_apprentice',
    isInstallManager: 'is_install_manager', isSalesManager: 'is_sales_manager', isDispatch: 'is_dispatch', signoffAll: 'signoff_all',
  };

  function readUserInput(b: any) {
    const out: Record<string, unknown> = {};
    if (b.name !== undefined) {
      const name = str(b.name, 120);
      if (!name) throw new HttpError(400, 'Name is required.');
      out.name = name;
    }
    if (b.email !== undefined) {
      const email = str(b.email).toLowerCase();
      if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'That email address does not look right.');
      out.email = email || null;
    }
    if (b.position !== undefined) out.position = str(b.position, 120) || null;
    if (b.tradeRole !== undefined) {
      if (b.tradeRole && !['install', 'service', 'salestech'].includes(b.tradeRole)) throw new HttpError(400, 'Unknown trade role.');
      out.trade_role = b.tradeRole || null;
      out.training_group = b.tradeRole ? ({ install: 'install', service: 'service', salestech: 'sales' } as any)[b.tradeRole] : null;
    }
    if (b.status !== undefined) {
      if (!['invited', 'active', 'disabled'].includes(b.status)) throw new HttpError(400, 'Unknown status.');
      out.status = b.status;
    }
    for (const [k, col] of Object.entries(FLAG_KEYS)) if (typeof b[k] === 'boolean') out[col] = b[k];
    if (b.supervisorId !== undefined) {
      if (b.supervisorId !== null && (typeof b.supervisorId !== 'string' || !/^[0-9a-f-]{36}$/.test(b.supervisorId)))
        throw new HttpError(400, 'Unknown supervisor.');
      out.supervisor_id = b.supervisorId;
    }
    return out;
  }

  app.post('/api/admin/users', async (req) => {
    need(req, isAdmin);
    const input = readUserInput(req.body ?? {});
    if (!input.name) throw new HttpError(400, 'Name is required.');
    if (input.email && (await one(`select 1 from users where lower(email) = $1`, [input.email])))
      throw new HttpError(409, 'That email is already used by another account.');
    const cols = Object.keys(input);
    const row = await one<UserRow>(
      `insert into users (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
      Object.values(input),
    );
    return { user: publicUser(row!) };
  });

  app.patch('/api/admin/users/:id', async (req) => {
    const me = need(req, isAdmin);
    const id = (req.params as any).id;
    const input = readUserInput(req.body ?? {});
    delete input.status; // status changes go through dedicated fields below
    const b = req.body as any;
    if (b?.disabled === true) {
      if (id === me.id) throw new HttpError(400, "You can't disable your own account.");
      input.status = 'disabled';
    }
    if (b?.disabled === false) {
      const u = await one<UserRow>(`select * from users where id = $1`, [id]);
      input.status = u?.password_hash ? 'active' : 'invited';
    }
    if (id === me.id && input.is_admin === false) throw new HttpError(400, "You can't remove your own admin access.");
    if (input.email && (await one(`select 1 from users where lower(email) = $1 and id <> $2`, [input.email, id])))
      throw new HttpError(409, 'That email is already used by another account.');
    const cols = Object.keys(input);
    if (!cols.length) throw new HttpError(400, 'Nothing to update.');
    const row = await one<UserRow>(
      `update users set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} where id = $1 returning *`,
      [id, ...Object.values(input)],
    );
    if (!row) throw new HttpError(404, 'User not found.');
    if (row.status === 'disabled') await q(`delete from sessions where user_id = $1`, [id]);
    return { user: publicUser(row) };
  });

  app.post('/api/admin/users/:id/link', async (req) => {
    const me = need(req, isAdmin);
    const u = await one<UserRow>(`select * from users where id = $1`, [(req.params as any).id]);
    if (!u) throw new HttpError(404, 'User not found.');
    if (u.status === 'disabled') throw new HttpError(400, 'Enable this account first.');
    return createLink(u.id, u.password_hash ? 'reset' : 'invite', me.id);
  });

  // ------------------------------------------------------------------ admin: classes
  app.get('/api/admin/classes', async (req) => {
    need(req, isStaff);
    const rows = await q(
      `select c.*, (select count(*)::int from class_attendance a where a.class_id = c.id) attendees,
              p.name presenter_name
         from classes c left join users p on p.id = c.presenter_id
        order by case c.status when 'live' then 0 when 'scheduled' then 1 else 2 end,
                 coalesce(c.scheduled_at, c.created_at) desc
        limit 200`,
    );
    return { classes: rows };
  });

  app.post('/api/admin/classes', async (req) => {
    const me = need(req, canPresent);
    const b = req.body as any;
    const title = str(b?.title, 160);
    const group = str(b?.groupId, 20);
    const moduleIds: string[] = Array.isArray(b?.moduleIds) ? b.moduleIds.filter((x: unknown) => typeof x === 'string' && getModule(x)) : [];
    if (!title) throw new HttpError(400, 'Give the class a title.');
    if (!GROUPS.some((g) => g.id === group)) throw new HttpError(400, 'Choose a group.');
    if (!moduleIds.length) throw new HttpError(400, 'Choose at least one module.');
    const when = b?.scheduledAt ? new Date(b.scheduledAt) : null;
    if (when && isNaN(when.getTime())) throw new HttpError(400, 'That date and time is not valid.');
    const row = await one(
      `insert into classes (title, group_id, module_ids, scheduled_at, created_by) values ($1, $2, $3, $4, $5) returning *`,
      [title, group, moduleIds, when, me.id],
    );
    return { class: row };
  });

  app.get('/api/admin/classes/:id', async (req) => {
    need(req, isStaff);
    const c = await one(`select * from classes where id = $1`, [(req.params as any).id]);
    if (!c) throw new HttpError(404, 'Class not found.');
    const attendance = await q(
      `select u.id, u.name, a.manual, a.joined_at from class_attendance a join users u on u.id = a.user_id
        where a.class_id = $1 order by u.name`, [c.id]);
    return { class: c, attendance, slideCount: classDeck(c.module_ids, c.title, false).length };
  });

  app.delete('/api/admin/classes/:id', async (req) => {
    need(req, canPresent);
    const r = await q(`delete from classes where id = $1 and status = 'scheduled' returning id`, [(req.params as any).id]);
    if (!r.length) throw new HttpError(400, 'Only classes that have not started can be deleted.');
    return { ok: true };
  });

  app.post('/api/admin/classes/:id/start', async (req) => {
    const me = need(req, canPresent);
    const c = await one(`select * from classes where id = $1`, [(req.params as any).id]);
    if (!c) throw new HttpError(404, 'Class not found.');
    if (c.status === 'ended') throw new HttpError(400, 'This class has already ended. Create a new one.');
    if (c.status === 'live') return { code: c.join_code };
    for (let i = 0; i < 20; i++) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      try {
        await q(
          `update classes set status = 'live', join_code = $2, presenter_id = $3, started_at = now(), current_slide = 0, phase = 'show'
            where id = $1`, [c.id, code, me.id]);
        return { code };
      } catch (e: any) {
        if (e.code !== '23505') throw e; // code clash with another live class: try again
      }
    }
    throw new HttpError(500, 'Could not create a join code. Try again.');
  });
}
