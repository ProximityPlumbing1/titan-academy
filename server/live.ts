import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { one, q, tx } from './db.js';
import { maybeIssue } from './certificates.js';
import { COOKIE, HttpError, canPresent, isStaff, need, userFromToken, type UserRow } from './auth.js';
import { answerFor, classDeck, getModule, quizFor } from './content.js';
import { config } from './config.js';
import {
  isQuestion, type ClassSummary, type LiveInit, type LiveState, type Phase, type Reveal, type Slide,
} from '../shared/types.js';

type Role = 'present' | 'follow' | 'tv';
interface Client { ws: WebSocket; role: Role; userId?: string }
interface Room {
  classId: string; code: string; title: string; groupId: string; moduleIds: string[];
  full: Slide[]; public: Slide[];
  slide: number; phase: Phase; revealed: Set<string>;
  answers: Map<string, Map<string, number>>; // slideKey -> userId -> choice
  attendees: Map<string, { name: string; manual: boolean }>;
  clients: Set<Client>;
}

const rooms = new Map<string, Room>();
const loading = new Map<string, Promise<Room | null>>();

export function userGroups(u: UserRow): string[] {
  const g = ['all'];
  if (u.trade_role === 'install') g.push('field', 'install');
  if (u.trade_role === 'service') g.push('field', 'service');
  if (u.trade_role === 'salestech') g.push('sales');
  return g;
}
export const canJoin = (u: UserRow, groupId: string) => isStaff(u) || userGroups(u).includes(groupId);

export async function liveClassesFor(u: UserRow) {
  const rows = await q(`select id, title, group_id, join_code from classes where status = 'live' order by started_at desc`);
  return rows.filter((r) => canJoin(u, r.group_id)).map((r) => ({ id: r.id, title: r.title, groupId: r.group_id, code: r.join_code }));
}

async function loadRoom(id: string): Promise<Room | null> {
  const c = await one(`select * from classes where id = $1 and status = 'live'`, [id]);
  if (!c) return null;
  const room: Room = {
    classId: c.id, code: c.join_code, title: c.title, groupId: c.group_id, moduleIds: c.module_ids,
    full: classDeck(c.module_ids, c.title, true), public: classDeck(c.module_ids, c.title, false),
    slide: c.current_slide, phase: c.phase, revealed: new Set(c.revealed), answers: new Map(), attendees: new Map(),
    clients: new Set(),
  };
  for (const a of await q(`select slide_key, user_id, choice from class_answers where class_id = $1`, [id])) {
    if (!room.answers.has(a.slide_key)) room.answers.set(a.slide_key, new Map());
    room.answers.get(a.slide_key)!.set(a.user_id, a.choice);
  }
  for (const a of await q(
    `select a.user_id, a.manual, u.name from class_attendance a join users u on u.id = a.user_id where a.class_id = $1`, [id]))
    room.attendees.set(a.user_id, { name: a.name, manual: a.manual });
  rooms.set(id, room);
  return room;
}

async function roomById(id: string): Promise<Room | null> {
  const existing = rooms.get(id);
  if (existing) return existing;
  if (!loading.has(id)) loading.set(id, loadRoom(id).finally(() => loading.delete(id)));
  return loading.get(id)!;
}

async function roomByCode(code: string): Promise<Room | null> {
  if (!/^\d{4}$/.test(code)) return null;
  const c = await one(`select id from classes where status = 'live' and join_code = $1`, [code]);
  return c ? roomById(c.id) : null;
}

function revealFor(room: Room, key: string): Reveal | undefined {
  if (!room.revealed.has(key)) return undefined;
  const ans = answerFor(key);
  if (!ans) return undefined;
  const counts = new Array(ans.options).fill(0);
  const m = room.answers.get(key);
  if (m) for (const c of m.values()) if (c >= 0 && c < counts.length) counts[c]++;
  return { correct: ans.correct, counts, answered: m?.size ?? 0, explanation: ans.explanation };
}

function stateFor(room: Room, client: Pick<Client, 'role' | 'userId'>): LiveState {
  const key = room.full[room.slide]?.key;
  const m = key ? room.answers.get(key) : undefined;
  const st: LiveState = {
    type: 'state', slide: room.slide, phase: room.phase, answered: m?.size ?? 0, attendees: room.attendees.size,
    reveal: key ? revealFor(room, key) : undefined,
  };
  if (client.role === 'follow' && client.userId) st.myAnswer = m?.get(client.userId) ?? null;
  if (client.role === 'present') {
    const connected = new Set([...room.clients].filter((c) => c.role === 'follow' && c.userId).map((c) => c.userId));
    st.presence = [...room.attendees]
      .map(([id, a]) => ({ id, name: a.name, manual: a.manual, connected: connected.has(id), answered: !!m?.has(id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return st;
}

function initFor(room: Room, role: Role): LiveInit {
  return {
    type: 'init', role, classId: room.classId, title: room.title, code: room.code,
    joinUrl: `${config.publicUrl}/live/${room.code}`, deck: role === 'present' ? room.full : room.public,
  };
}

function send(c: Client, msg: unknown) {
  if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
}
function broadcast(room: Room) {
  for (const c of room.clients) send(c, stateFor(room, c));
}
async function persist(room: Room) {
  await q(`update classes set current_slide = $2, phase = $3, revealed = $4 where id = $1`,
    [room.classId, room.slide, room.phase, [...room.revealed]]);
}

async function addAttendee(room: Room, userId: string, name: string, manual: boolean) {
  if (room.attendees.has(userId)) return;
  await q(`insert into class_attendance (class_id, user_id, manual) values ($1, $2, $3) on conflict do nothing`,
    [room.classId, userId, manual]);
  room.attendees.set(userId, { name, manual });
}

async function control(room: Room, msg: any): Promise<unknown> {
  switch (msg?.action) {
    case 'goto':
    case 'next':
    case 'prev': {
      const target = msg.action === 'goto' ? Number(msg.index) : room.slide + (msg.action === 'next' ? 1 : -1);
      if (!Number.isFinite(target)) throw new HttpError(400, 'Bad slide.');
      room.slide = Math.max(0, Math.min(room.full.length - 1, Math.trunc(target)));
      const s = room.full[room.slide];
      room.phase = isQuestion(s) ? (room.revealed.has(s.key) ? 'reveal' : 'open') : 'show';
      break;
    }
    case 'reveal': {
      const s = room.full[room.slide];
      if (!isQuestion(s)) throw new HttpError(400, 'This slide has no question.');
      room.revealed.add(s.key);
      room.phase = 'reveal';
      break;
    }
    case 'reopen': {
      const s = room.full[room.slide];
      if (!isQuestion(s)) throw new HttpError(400, 'This slide has no question.');
      room.revealed.delete(s.key);
      room.phase = 'open';
      break;
    }
    case 'attend': {
      const u = await one<UserRow>(`select * from users where id = $1`, [String(msg.userId)]);
      if (!u) throw new HttpError(404, 'Person not found.');
      await addAttendee(room, u.id, u.name, true);
      broadcast(room);
      return { ok: true };
    }
    case 'end':
      return { summary: await endClass(room) };
    default:
      throw new HttpError(400, 'Unknown action.');
  }
  await persist(room);
  broadcast(room);
  return { ok: true };
}

async function answer(room: Room, user: UserRow, key: string, choice: number) {
  const s = room.full[room.slide];
  if (!isQuestion(s) || s.key !== key || room.phase !== 'open') throw new HttpError(409, 'That question is closed.');
  const ans = answerFor(key);
  if (!ans || !Number.isInteger(choice) || choice < 0 || choice >= ans.options) throw new HttpError(400, 'Invalid answer.');
  await addAttendee(room, user.id, user.name, false);
  await q(
    `insert into class_answers (class_id, user_id, slide_key, choice, correct) values ($1, $2, $3, $4, $5)
     on conflict (class_id, user_id, slide_key) do update set choice = excluded.choice, correct = excluded.correct, answered_at = now()`,
    [room.classId, user.id, key, choice, choice === ans.correct],
  );
  if (!room.answers.has(key)) room.answers.set(key, new Map());
  room.answers.get(key)!.set(user.id, choice);
  broadcast(room);
}

async function endClass(room: Room): Promise<ClassSummary> {
  const summary: ClassSummary = {
    attended: room.attendees.size, names: [...room.attendees.values()].map((a) => a.name).sort(), modules: [],
  };
  await tx(async (c) => {
    for (const moduleId of room.moduleIds) {
      const hit = getModule(moduleId);
      if (!hit) continue;
      const quiz = quizFor(moduleId);
      const scores: number[] = [];
      const needRetake: string[] = [];
      for (const [userId, a] of room.attendees) {
        await c.query(
          `insert into lesson_progress (user_id, module_id, lesson_index, source)
           select $1, $2, i, 'live' from generate_series(0, $3 - 1) i on conflict do nothing`,
          [userId, moduleId, hit.module.lessons.length],
        );
        if (!quiz.length) continue;
        const chosen = quiz.map((_, i) => room.answers.get(`${moduleId}.q${i + 1}`)?.get(userId) ?? null);
        if (chosen.every((x) => x === null)) { needRetake.push(a.name); continue; }
        const right = quiz.filter((qq, i) => chosen[i] === qq.correct).length;
        const score = Math.round((right / quiz.length) * 100);
        const passed = score >= 80;
        await c.query(
          `insert into quiz_attempts (user_id, module_id, score, passed, answers, source, class_id) values ($1, $2, $3, $4, $5, 'live', $6)`,
          [userId, moduleId, score, passed, JSON.stringify(chosen), room.classId],
        );
        scores.push(score);
        if (!passed) needRetake.push(a.name);
      }
      summary.modules.push({
        moduleId, title: hit.module.title, questions: quiz.length,
        averageScore: scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : null,
        needRetake: needRetake.sort(),
      });
    }
    await c.query(`update classes set status = 'ended', ended_at = now(), summary = $2 where id = $1`,
      [room.classId, JSON.stringify(summary)]);
  });
  for (const cl of room.clients) send(cl, { type: 'ended', summary });
  rooms.delete(room.classId);
  await maybeIssue([...room.attendees.keys()]).catch((e) => console.error('certificate check failed', e));
  return summary;
}

async function authorise(role: string, room: Room, user: UserRow | null) {
  if (!['present', 'follow', 'tv'].includes(role)) throw new HttpError(400, 'Unknown role.');
  if (role === 'tv') return;
  if (!user) throw new HttpError(401, 'Please sign in.');
  if (role === 'present' && !canPresent(user)) throw new HttpError(403, "You can't present this class.");
  if (role === 'follow' && !canJoin(user, room.groupId)) throw new HttpError(403, 'This class is for another group.');
}

export async function registerLive(app: FastifyInstance) {
  app.get('/ws/live', { websocket: true }, (socket: WebSocket, req) => {
    let room: Room | null = null;
    let client: Client | null = null;
    let user: UserRow | null = null;
    let ready = false;
    const queue: string[] = [];
    const ping = setInterval(() => socket.readyState === 1 && socket.ping(), 25000);

    const fail = (e: any) => {
      try { socket.send(JSON.stringify({ type: 'error', message: e?.message ?? 'Error' })); } catch { /* closed */ }
    };
    const handle = async (raw: string) => {
      try {
        const msg = JSON.parse(raw);
        if (!room || !client) return;
        if (msg.type === 'control' && client.role === 'present') await control(room, msg);
        else if (msg.type === 'answer' && client.role === 'follow' && user) await answer(room, user, String(msg.key), Number(msg.choice));
      } catch (e) {
        fail(e);
      }
    };

    socket.on('message', (raw) => {
      const text = raw.toString();
      if (!ready) queue.push(text);
      else void handle(text);
    });
    socket.on('close', () => {
      clearInterval(ping);
      if (room && client) {
        room.clients.delete(client);
        broadcast(room);
      }
    });

    void (async () => {
      try {
        const query = req.query as any;
        const role = String(query.role ?? '') as Role;
        room = await roomByCode(String(query.code ?? ''));
        if (!room) throw new HttpError(404, 'That class is not live.');
        user = role === 'tv' ? null : await userFromToken(req.cookies[COOKIE]);
        await authorise(role, room, user);
        client = { ws: socket, role, userId: user?.id };
        if (role === 'follow') await addAttendee(room, user!.id, user!.name, false);
        room.clients.add(client);
        send(client, initFor(room, role));
        broadcast(room);
        ready = true;
        for (const m of queue.splice(0)) await handle(m);
      } catch (e: any) {
        fail(e);
        socket.close(4000 + ((e?.status ?? 500) % 1000));
      }
    })();
  });

  // ---- HTTP fallbacks (used when the WebSocket drops) ----
  app.get('/api/live/:code/state', async (req) => {
    const role = String((req.query as any).role ?? 'tv') as Role;
    const room = await roomByCode((req.params as any).code);
    if (!room) {
      const ended = await one(`select summary from classes where join_code = $1 and status = 'ended' order by ended_at desc limit 1`,
        [(req.params as any).code]);
      if (ended) return { ended: true, summary: ended.summary };
      throw new HttpError(404, 'That class is not live.');
    }
    await authorise(role, room, req.user);
    if (role === 'follow') await addAttendee(room, req.user!.id, req.user!.name, false);
    return { init: initFor(room, role), state: stateFor(room, { role, userId: req.user?.id }) };
  });

  app.post('/api/live/:code/answer', async (req) => {
    const user = need(req);
    const room = await roomByCode((req.params as any).code);
    if (!room) throw new HttpError(404, 'That class is not live.');
    await authorise('follow', room, user);
    const b = req.body as any;
    await answer(room, user, String(b?.key), Number(b?.choice));
    return { ok: true };
  });

  app.post('/api/live/:code/control', async (req) => {
    const user = need(req, canPresent);
    const room = await roomByCode((req.params as any).code);
    if (!room) throw new HttpError(404, 'That class is not live.');
    return control(room, req.body);
  });

  // People who could be ticked in manually by the presenter.
  app.get('/api/live/:code/people', async (req) => {
    need(req, canPresent);
    const room = await roomByCode((req.params as any).code);
    if (!room) throw new HttpError(404, 'That class is not live.');
    const users = await q<UserRow>(`select * from users where status <> 'disabled' and trade_role is not null order by name`);
    return {
      people: users
        .filter((u) => userGroups(u).includes(room.groupId) && !room.attendees.has(u.id))
        .map((u) => ({ id: u.id, name: u.name })),
    };
  });
}
