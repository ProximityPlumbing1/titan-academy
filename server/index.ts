import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { pool } from './db.js';
import { COOKIE, HttpError, userFromToken } from './auth.js';
import { registerRoutes } from './routes.js';
import { registerLive } from './live.js';

const app = Fastify({ logger: { level: config.isProd ? 'info' : 'warn' }, trustProxy: true, bodyLimit: 256 * 1024 });

await app.register(cookie);
await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

app.decorateRequest('user', null);

app.addHook('onRequest', async (req, reply) => {
  const url = req.url;
  if (!url.startsWith('/api/') && !url.startsWith('/ws/')) return;
  // CSRF guard: state-changing API calls must carry our custom header (forces a CORS preflight cross-site).
  if (url.startsWith('/api/') && req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-titan'] !== '1') {
    return reply.code(403).send({ error: 'Missing request header.' });
  }
  req.user = await userFromToken(req.cookies?.[COOKIE]);
});

app.addHook('onSend', async (_req, reply, payload) => {
  reply.header('x-content-type-options', 'nosniff');
  reply.header('referrer-policy', 'same-origin');
  reply.header('x-frame-options', 'DENY');
  reply.header(
    'content-security-policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'",
  );
  return payload;
});

app.setErrorHandler((err: any, req, reply) => {
  const status = err instanceof HttpError ? err.status : err.statusCode ?? 500;
  if (status >= 500) req.log.error(err);
  const message = err instanceof HttpError || status < 500 ? err.message : 'Something went wrong. Please try again.';
  reply.status(status).send({ error: message });
});

app.get('/health', async () => {
  await pool.query('select 1');
  return { ok: true, app: 'titan-academy' };
});

await registerRoutes(app);
await registerLive(app);

const webDir = path.join(process.cwd(), 'dist', 'web');
if (fs.existsSync(webDir)) {
  await app.register(fastifyStatic, {
    root: webDir,
    wildcard: false,
    setHeaders: (res: any, filePath: string) => {
      const value = filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
      if (typeof res.setHeader === 'function') res.setHeader('cache-control', value);
      else res.header('cache-control', value);
    },
  });
}

app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/ws/') || req.method !== 'GET' || !fs.existsSync(webDir)) {
    return reply.code(404).send({ error: 'Not found.' });
  }
  reply.header('cache-control', 'no-cache');
  return reply.sendFile('index.html');
});

const close = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', close);
process.on('SIGINT', close);

await app.listen({ host: '0.0.0.0', port: config.port });
console.log(`titan-academy listening on ${config.port}`);
