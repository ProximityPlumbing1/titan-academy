import fs from 'node:fs';
import path from 'node:path';
import { pool } from './db.js';
import { config } from './config.js';

// Current office team (Nov 2026). Anyone not listed here or in data/team-roster.csv has left.
const OFFICE: Array<{
  key: string; name: string; position: string;
  admin?: boolean; trainer?: boolean; assessor?: boolean;
}> = [
  { key: 'william', name: 'William', position: 'Owner', admin: true, trainer: true, assessor: true },
  { key: 'aldwin', name: 'Aldwin', position: 'Administration', admin: true },
  { key: 'charlotte', name: 'Charlotte', position: 'Operations Manager (interim Install & Service Manager)', trainer: true, assessor: true },
  { key: 'sadie', name: 'Sadie Sands', position: 'Office Manager' },
  { key: 'harriet', name: 'Harriet Burns', position: 'Sales Manager', trainer: true, assessor: true },
  { key: 'carla', name: 'Carla', position: 'Finance Manager' },
  { key: 'alex', name: 'Alex Letowski', position: 'Commercial Manager' },
  { key: 'isabella', name: 'Isabella Marfé', position: 'Business Partnerships Manager' },
  { key: 'kim', name: 'Kim Storch', position: 'Residential Dispatcher', assessor: true },
  { key: 'ruby', name: 'Ruby Douglass', position: 'Commercial Dispatcher' },
  { key: 'abigail', name: 'Abigail Rose', position: 'Customer Service Representative' },
  { key: 'elle', name: 'Elle Smith', position: 'Customer Service Representative' },
  { key: 'chloe', name: 'Chloe Reece', position: 'Customer Service Representative' },
];

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export function readRoster(): Array<{ name: string; tradeRole: string; apprentice: boolean; group: string }> {
  const file = path.join(process.cwd(), 'data', 'team-roster.csv');
  const [header, ...lines] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const cols = header.split(',');
  const idx = (c: string) => cols.indexOf(c);
  return lines.filter(Boolean).map((line) => {
    const f = line.split(',');
    return {
      name: f[idx('name')].trim(),
      tradeRole: f[idx('trade_role')].trim(),
      apprentice: f[idx('apprentice')].trim() === 'yes',
      group: f[idx('training_group')].trim(),
    };
  });
}

export async function seed() {
  for (const o of OFFICE) {
    await pool.query(
      `insert into users (seed_key, name, position, is_admin, is_office, is_trainer, is_assessor)
       values ($1, $2, $3, $4, true, $5, $6)
       on conflict (seed_key) do nothing`,
      [`office:${o.key}`, o.name, o.position, !!o.admin, !!o.trainer, !!o.assessor],
    );
  }
  if (config.ownerEmail) {
    await pool.query(
      `update users set email = $1
        where seed_key = 'office:william' and email is null
          and not exists (select 1 from users where lower(email) = $1)`,
      [config.ownerEmail],
    );
  }
  let techs = 0;
  for (const t of readRoster()) {
    const r = await pool.query(
      `insert into users (seed_key, name, position, trade_role, training_group, is_apprentice)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (seed_key) do nothing`,
      [
        `tech:${slug(t.name)}`, t.name,
        t.tradeRole === 'install' ? (t.apprentice ? 'Install Tech (apprentice)' : 'Install Tech')
          : t.tradeRole === 'service' ? 'Service Tech' : 'Sales Tech',
        t.tradeRole, t.group, t.apprentice,
      ],
    );
    techs += r.rowCount ?? 0;
  }
  console.log(`seed: ok (${techs} new techs)`);
}
