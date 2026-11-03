import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitMarkers } from '../shared/types';
import { answerFor, classDeck, getModule, program, modulesForRole, moduleSlides, needsAnswers, parseLessonMarkdown, quizFor } from '../server/content';
import { canReview, dueDates, routeFor, sessionDate, weekOf } from '../server/program';
import { certificateTitle, drawFinal, poolFor } from '../server/certificates';

describe('content', () => {
  it('gives each trade the right paths', () => {
    expect(modulesForRole('install')).toHaveLength(7 + 12);
    expect(modulesForRole('service')).toHaveLength(7 + 5 + 10);
    expect(modulesForRole('salestech')).toHaveLength(8);
    expect(modulesForRole(null)).toHaveLength(0);
  });

  it('hides answers from the public deck but keeps them for presenters', () => {
    const pub = moduleSlides('f1', false).filter((s) => s.kind === 'quiz');
    const full = moduleSlides('f1', true).filter((s) => s.kind === 'quiz');
    expect(pub).toHaveLength(5);
    expect(pub.every((s) => s.kind === 'quiz' && s.correct === undefined && s.why === undefined)).toBe(true);
    expect(full.every((s) => s.kind === 'quiz' && typeof s.correct === 'number')).toBe(true);
  });

  it('has a valid 5-question quiz with a correct answer key for every module', () => {
    for (const id of [...modulesForRole('install'), ...modulesForRole('service'), ...modulesForRole('salestech')]) {
      const quiz = quizFor(id);
      expect(quiz.length).toBe(5);
      quiz.forEach((q, i) => {
        expect(q.options.length).toBe(4);
        expect(q.correct).toBeGreaterThanOrEqual(0);
        expect(q.correct).toBeLessThan(q.options.length);
        expect(answerFor(`${id}.q${i + 1}`)?.correct).toBe(q.correct);
      });
    }
    expect(answerFor('f4.sim1')?.correct).toBe(1);
    expect(answerFor('nope.q1')).toBeNull();
  });

  it('builds a class deck with welcome and end slides', () => {
    const deck = classDeck(['f1', 'f4'], 'Week 1', false);
    expect(deck[0].kind).toBe('welcome');
    expect(deck.at(-1)!.kind).toBe('end');
    expect(new Set(deck.map((s) => s.key)).size).toBe(deck.length);
  });

  it('finds CONFIRM / VERIFY markers', () => {
    expect(splitMarkers('Lodge on time. [VERIFY]')).toEqual([{ text: 'Lodge on time. ' }, { text: '', marker: 'VERIFY' }]);
    expect(splitMarkers('[CONFIRM: wording] then text')[0]).toEqual({ text: 'wording', marker: 'CONFIRM' });
    expect(needsAnswers().length).toBeGreaterThan(50);
  });
});

describe('written lessons', () => {
  it('parses paragraphs, lists and callouts', () => {
    const src = [
      '<!-- status: sample (awaiting owner approval) -->', '', '## First', '', 'Line one', 'continues **here**.', '',
      '- a', '- b', '', '1. one', '2. two', '', '> **On the job:** In Ryde.', '', '> **Say it like this:** "Hi."', '', '> Plain note',
      '', '## Second', '', 'Text.',
    ].join('\n');
    const { status, lessons } = parseLessonMarkdown(src);
    expect(status).toBe('sample (awaiting owner approval)');
    expect(lessons.map((l) => l.title)).toEqual(['First', 'Second']);
    expect(lessons[0].blocks).toEqual([
      { type: 'p', text: 'Line one continues **here**.' },
      { type: 'ul', items: ['a', 'b'] },
      { type: 'ol', items: ['one', 'two'] },
      { type: 'callout', kind: 'onjob', text: 'In Ryde.' },
      { type: 'callout', kind: 'say', text: '"Hi."' },
      { type: 'callout', kind: 'note', text: 'Plain note' },
    ]);
  });

  it('every lesson file matches its module lesson titles, in order', () => {
    const dir = path.join(process.cwd(), 'content', 'lessons');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const id = f.replace(/\.md$/, '');
      const hit = getModule(id);
      expect(hit, `${f} has no module`).toBeTruthy();
      const { lessons } = parseLessonMarkdown(fs.readFileSync(path.join(dir, f), 'utf8'));
      expect(lessons.length, `${f} lesson count`).toBeLessThanOrEqual(hit!.module.lessons.length);
      lessons.forEach((l, i) => {
        expect(l.title, `${f} lesson ${i + 1}`).toBe(hit!.module.lessons[i]);
        expect(l.blocks.length, `${f} lesson ${i + 1} is empty`).toBeGreaterThan(0);
      });
    }
  });

  it('every module has every lesson written', () => {
    const missing: string[] = [];
    for (const role of ['install', 'service', 'salestech']) {
      for (const id of modulesForRole(role)) {
        const hit = getModule(id)!;
        const file = path.join(process.cwd(), 'content', 'lessons', `${id}.md`);
        const n = fs.existsSync(file) ? parseLessonMarkdown(fs.readFileSync(file, 'utf8')).lessons.length : 0;
        if (n !== hit.module.lessons.length) missing.push(`${id}: ${n}/${hit.module.lessons.length}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('written lessons never name field staff', () => {
    const roster = fs.readFileSync(path.join(process.cwd(), 'data', 'team-roster.csv'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
    const names = roster.flatMap((r) => r.split(',')[0].split(/\s+/)).filter((n) => n.length > 2);
    const dir = path.join(process.cwd(), 'content', 'lessons');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const n of names) expect(new RegExp(`\\b${n}\\b`).test(text), `${f} mentions ${n}`).toBe(false);
    }
  });
});

describe('program and sign-offs', () => {
  const spec = { start_date: '2027-02-01', schedule: program.schedule };
  it('dates each module to the end of the week its group covers it', () => {
    const inst = dueDates(spec, 'install');
    expect(inst.get('f1')).toEqual({ week: 1, due: '2027-02-07' });
    expect(inst.get('i1')).toEqual({ week: 2, due: '2027-02-14' });
    expect(inst.size).toBe(modulesForRole('install').length);
    expect(dueDates(spec, 'service').size).toBe(modulesForRole('service').length);
    expect(dueDates(spec, 'salestech').get('x8')?.week).toBe(7);
    expect(weekOf(spec, '2027-01-31')).toBe(0);
    expect(weekOf(spec, '2027-02-01')).toBe(1);
    expect(weekOf(spec, '2027-02-08')).toBe(2);
  });
  it('places sessions on the group weekday, the second one two days later', () => {
    expect(sessionDate('2027-02-01', 1, 2, 0)).toBe('2027-02-02');
    expect(sessionDate('2027-02-01', 1, 2, 1)).toBe('2027-02-04');
    expect(sessionDate('2027-02-01', 3, 1, 0)).toBe('2027-02-15');
  });
  it('routes sign-offs from the "Signed off by" line', () => {
    const base = { id: 'r', status: 'active', signoff_all: false, is_lead_tech: false, trade_role: null, is_install_manager: false, is_sales_manager: false, is_dispatch: false } as any;
    const tech = { id: 't', trade_role: 'install' };
    expect(routeFor('f1')).toEqual(['lead_trade', 'install_manager']);
    expect(canReview({ ...base, is_lead_tech: true, trade_role: 'install' }, tech, 'f1')).toBe(true);
    expect(canReview({ ...base, is_lead_tech: true, trade_role: 'service' }, tech, 'f1')).toBe(false);
    expect(canReview({ ...base, is_sales_manager: true }, tech, 'f1')).toBe(false);
    expect(canReview({ ...base, signoff_all: true }, tech, 'f1')).toBe(true);
    expect(canReview({ ...base, signoff_all: true, id: 't' }, tech, 'f1')).toBe(false);
    for (const role of ['install', 'service', 'salestech'])
      for (const id of modulesForRole(role))
        if ((getModule(id)!.module.signoff ?? []).length) expect(routeFor(id).length, `${id} has no route`).toBeGreaterThan(0);
  });
});

describe('final assessment and certificates', () => {
  it('has a pool for every role, each question well formed', () => {
    for (const role of ['install', 'service', 'salestech']) {
      const pool = poolFor(role);
      expect(pool.length, role).toBeGreaterThanOrEqual(30);
      const mine = new Set(modulesForRole(role));
      for (const q of pool) {
        expect(mine.has(q.module), `${role} ${q.module}`).toBe(true);
        expect(q.options).toHaveLength(4);
        expect(q.correct).toBeGreaterThanOrEqual(0);
        expect(q.correct).toBeLessThan(4);
        expect(q.why.length).toBeGreaterThan(0);
      }
    }
  });
  it('draws 25 different questions spread across modules', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const draw = drawFinal('install', rand);
    expect(draw).toHaveLength(25);
    expect(new Set(draw.map((q) => q.q)).size).toBe(25);
    const perModule = new Map<string, number>();
    for (const q of draw) perModule.set(q.module, (perModule.get(q.module) ?? 0) + 1);
    expect(perModule.size).toBeGreaterThanOrEqual(15);
  });
  it('titles certificates by role, with the supervised version for apprentices', () => {
    expect(certificateTitle({ trade_role: 'install', is_apprentice: false })?.title).toBe('Proximity Certified Install Technician');
    expect(certificateTitle({ trade_role: 'install', is_apprentice: true })?.title).toBe('Supervised Competency, Install');
    expect(certificateTitle({ trade_role: 'service', is_apprentice: false })?.title).toBe('Proximity Certified Service Technician');
    expect(certificateTitle({ trade_role: 'salestech', is_apprentice: false })?.title).toBe('Proximity Advanced Sales Certification');
    expect(certificateTitle({ trade_role: null, is_apprentice: false })).toBeNull();
  });
});
