import { q } from './db.js';
import { getModule } from './content.js';

export const PASS = 80;      // module quiz pass mark
export const TEST_OUT = 90;  // a quiz score this high ticks off the lessons (test-out)

// A module is complete when its quiz is passed (80%+) and every lesson is read. Lessons are read
// on the phone, credited by attending the live class, or ticked off by testing out (90%+).
export async function completeModules(userIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (!userIds.length) return out;
  const rows = await q<{ user_id: string; module_id: string; n: number }>(
    `select p.user_id, p.module_id, count(l.lesson_index)::int n
       from (select distinct user_id, module_id from quiz_attempts where passed and user_id = any($1)) p
       left join lesson_progress l on l.user_id = p.user_id and l.module_id = p.module_id
      group by 1, 2`, [userIds]);
  for (const r of rows) {
    const need = getModule(r.module_id)?.module.lessons.length ?? Infinity;
    if (r.n >= need) (out.get(r.user_id) ?? out.set(r.user_id, new Set()).get(r.user_id)!).add(r.module_id);
  }
  return out;
}
