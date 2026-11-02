import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { one, q } from './db.js';
import { config } from './config.js';

export const COOKIE = 'ta_sid';

export interface UserRow {
  id: string; seed_key: string | null; name: string; email: string | null; password_hash: string | null;
  status: 'invited' | 'active' | 'disabled'; position: string | null; trade_role: string | null;
  training_group: string | null; is_admin: boolean; is_office: boolean; is_trainer: boolean;
  is_assessor: boolean; is_lead_tech: boolean; is_apprentice: boolean; created_at: string;
  last_login_at: string | null; last_seen_at: string | null;
}

export function publicUser(u: UserRow) {
  return {
    id: u.id, name: u.name, email: u.email, status: u.status, position: u.position, tradeRole: u.trade_role,
    trainingGroup: u.training_group, isAdmin: u.is_admin, isOffice: u.is_office, isTrainer: u.is_trainer,
    isAssessor: u.is_assessor, isLeadTech: u.is_lead_tech, isApprentice: u.is_apprentice,
    hasPassword: !!u.password_hash, lastLoginAt: u.last_login_at, lastSeenAt: u.last_seen_at,
  };
}
export type PublicUser = ReturnType<typeof publicUser>;

export const isStaff = (u: UserRow) => u.is_admin || u.is_office || u.is_trainer;
export const canPresent = (u: UserRow) => u.is_admin || u.is_trainer;

// ---- passwords (scrypt, built into Node) ----
function scrypt(pw: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((res, rej) =>
    crypto.scrypt(pw.normalize('NFKC'), salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))),
  );
}
export async function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  const [N, r, p] = [16384, 8, 1];
  const key = await scrypt(pw, salt, N, r, p);
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(pw: string, stored: string | null) {
  if (!stored) return false;
  const [alg, N, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const key = await scrypt(pw, Buffer.from(salt, 'base64'), Number(N), Number(r), Number(p));
  const h = Buffer.from(hash, 'base64');
  return h.length === key.length && crypto.timingSafeEqual(h, key);
}

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(sha256(a));
  const y = Buffer.from(sha256(b));
  return crypto.timingSafeEqual(x, y);
}

// ---- sessions ----
export async function startSession(reply: FastifyReply, req: FastifyRequest, userId: string) {
  const token = newToken();
  await q(
    `insert into sessions (token_hash, user_id, expires_at, user_agent)
     values ($1, $2, now() + make_interval(days => $3), $4)`,
    [sha256(token), userId, config.sessionDays, String(req.headers['user-agent'] ?? '').slice(0, 300)],
  );
  await q('update users set last_login_at = now(), last_seen_at = now() where id = $1', [userId]);
  reply.setCookie(COOKIE, token, {
    path: '/', httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: config.sessionDays * 86400,
  });
}

export async function endSession(reply: FastifyReply, req: FastifyRequest) {
  const token = req.cookies[COOKIE];
  if (token) await q('delete from sessions where token_hash = $1', [sha256(token)]);
  reply.clearCookie(COOKIE, { path: '/' });
}

export async function userFromToken(token: string | undefined): Promise<UserRow | null> {
  if (!token) return null;
  const row = await one<UserRow & { expires_at: string }>(
    `select u.*, s.expires_at from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(token)],
  );
  if (!row || row.status !== 'active') return null;
  // Rolling session and last-seen, at most once every 5 minutes.
  if (!row.last_seen_at || Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60 * 1000) {
    await q('update users set last_seen_at = now() where id = $1', [row.id]);
    await q(
      `update sessions set expires_at = now() + make_interval(days => $2) where token_hash = $1`,
      [sha256(token), config.sessionDays],
    );
  }
  return row;
}

declare module 'fastify' {
  interface FastifyRequest { user: UserRow | null }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function need(req: FastifyRequest, check?: (u: UserRow) => boolean): UserRow {
  const u = req.user;
  if (!u) throw new HttpError(401, 'Please sign in.');
  if (check && !check(u)) throw new HttpError(403, "You don't have access to that.");
  return u;
}

// ---- one-time invite / reset links ----
export async function createLink(userId: string, kind: 'invite' | 'reset', createdBy: string | null) {
  const token = newToken();
  const days = kind === 'invite' ? config.inviteDays : config.resetDays;
  await q(`update auth_tokens set used_at = now() where user_id = $1 and used_at is null`, [userId]);
  const row = await one<{ expires_at: string }>(
    `insert into auth_tokens (token_hash, user_id, kind, created_by, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(days => $5)) returning expires_at`,
    [sha256(token), userId, kind, createdBy, days],
  );
  return { url: `${config.publicUrl}/${kind}/${token}`, kind, expiresAt: row!.expires_at };
}

export async function lookupLink(token: string) {
  return one<UserRow & { kind: 'invite' | 'reset'; token_expires: string }>(
    `select u.*, t.kind, t.expires_at as token_expires from auth_tokens t join users u on u.id = t.user_id
      where t.token_hash = $1 and t.used_at is null and t.expires_at > now()`,
    [sha256(token)],
  );
}
