import type { FastifyInstance } from 'fastify';
import { one, q } from './db.js';
import { need, publicUser } from './auth.js';
import { getModule, pathsForRole } from './content.js';
import { activeProgram, dueDates, signoffItems } from './program.js';
import { completeModules } from './progress.js';
import { statusFor } from './certificates.js';

// A tech's own record in one place: progress by path, quiz results, sign-offs, final attempts and certificate.
export async function registerProfile(app: FastifyInstance) {
  app.get('/api/me/profile', async (req) => {
    const u = need(req);
    const complete = (await completeModules([u.id])).get(u.id) ?? new Set<string>();
    const lessons = new Map((await q<{ module_id: string; n: number }>(
      `select module_id, count(*)::int n from lesson_progress where user_id = $1 group by 1`, [u.id])).map((r) => [r.module_id, r.n]));
    const quiz = new Map((await q<{ module_id: string; best: number; n: number; last: string }>(
      `select module_id, max(score)::int best, count(*)::int n, max(created_at) last from quiz_attempts where user_id = $1 group by 1`, [u.id]))
      .map((r) => [r.module_id, r]));
    const signoffs = await q(
      `select s.module_id, s.item_index, s.item_text, s.status, s.job_ref, s.review_note, s.requested_at, s.reviewed_at, r.name reviewer
         from signoffs s left join users r on r.id = s.reviewed_by where s.user_id = $1 order by coalesce(s.reviewed_at, s.requested_at) desc`, [u.id]);
    const approved = new Set(signoffs.filter((s: any) => s.status === 'approved').map((s: any) => `${s.module_id}:${s.item_index}`));
    const program = await activeProgram();
    const due = program ? dueDates(program, u.trade_role) : new Map();
    const paths = pathsForRole(u.trade_role).map((p) => ({
      id: p.id, name: p.name,
      modules: p.modules.map((m) => {
        const items = signoffItems(m.id);
        return {
          id: m.id, title: m.title, complete: complete.has(m.id), lessonsRead: Math.min(lessons.get(m.id) ?? 0, m.lessons.length), lessons: m.lessons.length,
          best: quiz.get(m.id)?.best ?? null, attempts: quiz.get(m.id)?.n ?? 0, due: due.get(m.id)?.due ?? null,
          signoffs: { approved: items.filter((_, i) => approved.has(`${m.id}:${i}`)).length, total: items.length },
        };
      }),
    }));
    const finals = await q(`select score, passed, submitted_at from final_attempts where user_id = $1 and submitted_at is not null order by submitted_at`, [u.id]);
    const certificate = await one(`select number, title, completed_on::text from certificates where user_id = $1 and revoked_at is null`, [u.id]);
    const status = u.trade_role ? (await statusFor([u])).get(u.id) ?? null : null;
    return {
      user: publicUser(u), paths, status, finals, certificate,
      signoffs: signoffs.map((s: any) => ({ ...s, moduleTitle: getModule(s.module_id)?.module.title ?? s.module_id })),
    };
  });
}
