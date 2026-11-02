import fs from 'node:fs';
import path from 'node:path';
import { pool } from './db.js';
import { seed } from './seed.js';

async function main() {
  const c = await pool.connect();
  try {
    await c.query('select pg_advisory_lock(735173)');
    await c.query(
      'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
    );
    const dir = path.join(process.cwd(), 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const done = new Set((await c.query('select name from schema_migrations')).rows.map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      try {
        await c.query('begin');
        await c.query(sql);
        await c.query('insert into schema_migrations (name) values ($1)', [f]);
        await c.query('commit');
        console.log('migrate: applied', f);
      } catch (e) {
        await c.query('rollback');
        throw e;
      }
    }
    await seed();
    await c.query('select pg_advisory_unlock(735173)');
  } finally {
    c.release();
  }
  await pool.end();
  console.log('migrate: done');
}

main().catch((e) => {
  console.error('migrate: failed', e);
  process.exit(1);
});
