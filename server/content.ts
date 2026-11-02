import fs from 'node:fs';
import path from 'node:path';
import type { Slide } from '../shared/types.js';

export interface TradeModule {
  id: string; title: string; objective: string; assessor?: string; lessons: string[]; key_points: string[];
  signoff?: string[]; confirm?: string[]; sim?: { persona: string; scenario: string; good_moves: string[] };
}
export interface TradePath { id: string; name: string; who: string; summary: string; modules: TradeModule[] }
interface QuizQuestion { q: string; options: string[]; correct: number; why: string }
interface SimStep { them: string; options: string[]; best: number; feedback: string }
interface ModuleExtras { questions?: QuizQuestion[]; sim?: { persona: string; scenario: string; steps: SimStep[] } }

const root = process.cwd();
const trade = JSON.parse(fs.readFileSync(path.join(root, 'data', 'trade-paths.json'), 'utf8'));
const extras: Record<string, ModuleExtras> = JSON.parse(
  fs.readFileSync(path.join(root, 'content', 'quizzes.json'), 'utf8'),
).modules;

export const paths: TradePath[] = trade.paths;
export const program = trade.program;

const index = new Map<string, { module: TradeModule; path: TradePath; position: number }>();
for (const p of paths) p.modules.forEach((m, i) => index.set(m.id, { module: m, path: p, position: i + 1 }));

export function getModule(id: string) {
  return index.get(id) ?? null;
}

export const ROLE_PATHS: Record<string, string[]> = {
  install: ['field', 'install'],
  service: ['field', 'selling', 'service'],
  salestech: ['salestech'],
};

export function pathsForRole(role: string | null): TradePath[] {
  if (!role) return [];
  return (ROLE_PATHS[role] ?? []).map((id) => paths.find((p) => p.id === id)!).filter(Boolean);
}

export function modulesForRole(role: string | null): string[] {
  return pathsForRole(role).flatMap((p) => p.modules.map((m) => m.id));
}

export function quizFor(id: string): QuizQuestion[] {
  return extras[id]?.questions ?? [];
}

export function simFor(id: string) {
  return extras[id]?.sim ?? null;
}

export function publicModule(id: string) {
  const hit = getModule(id);
  if (!hit) return null;
  const { module: m, path: p, position } = hit;
  return {
    id: m.id, title: m.title, objective: m.objective, pathId: p.id, pathName: p.name, position,
    moduleCount: p.modules.length, lessons: m.lessons, keyPoints: m.key_points, signoff: m.signoff ?? [],
    assessor: m.assessor ?? null, quizLength: quizFor(id).length, hasSim: !!simFor(id),
  };
}

function firstSentence(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(.+?[.!?])(\s|$)/);
  if (!m || m[1].length < 12) return { lead: clean, rest: '' };
  return { lead: m[1], rest: clean.slice(m[1].length).trim() };
}

export function moduleSlides(id: string, withAnswers: boolean): Slide[] {
  const hit = getModule(id);
  if (!hit) return [];
  const { module: m, path: p, position } = hit;
  const base = { moduleId: m.id, moduleTitle: m.title, pathName: p.name };
  const slides: Slide[] = [];
  slides.push({ ...base, key: `${id}.title`, kind: 'title', objective: m.objective, label: `${p.name} · Module ${position} of ${p.modules.length}` });
  if (m.lessons.length) slides.push({ ...base, key: `${id}.covers`, kind: 'covers', lessons: m.lessons.slice(0, 9) });
  m.key_points.forEach((kp, i) => {
    const { lead, rest } = firstSentence(kp);
    const parts = rest.split(/;\s+/);
    const bullets = parts.length >= 3 ? parts.map((s) => s.replace(/^and\s+/i, '').replace(/\.$/, '')) : [];
    slides.push({ ...base, key: `${id}.p${i + 1}`, kind: 'point', lead, detail: bullets.length ? '' : rest, bullets, index: i + 1, total: m.key_points.length });
  });
  const sim = simFor(id);
  if (sim) {
    sim.steps.forEach((s, i) => {
      slides.push({
        ...base, key: `${id}.sim${i + 1}`, kind: 'sim', persona: sim.persona, scenario: sim.scenario, step: i + 1,
        total: sim.steps.length, them: s.them, options: s.options,
        ...(withAnswers ? { correct: s.best, feedback: s.feedback } : {}),
      });
    });
  }
  const quiz = quizFor(id);
  quiz.forEach((qq, i) => {
    slides.push({
      ...base, key: `${id}.q${i + 1}`, kind: 'quiz', number: i + 1, total: quiz.length, question: qq.q, options: qq.options,
      ...(withAnswers ? { correct: qq.correct, why: qq.why } : {}),
    });
  });
  if (m.signoff?.length) slides.push({ ...base, key: `${id}.signoff`, kind: 'signoff', items: m.signoff, assessor: m.assessor });
  slides.push({ ...base, key: `${id}.recap`, kind: 'recap', points: m.key_points.slice(0, 3).map((k) => firstSentence(k).lead) });
  return slides;
}

export function classDeck(moduleIds: string[], title: string, withAnswers: boolean): Slide[] {
  const deck: Slide[] = [{ key: 'welcome', kind: 'welcome', title, subtitle: 'Join on your phone' }];
  for (const id of moduleIds) deck.push(...moduleSlides(id, withAnswers));
  deck.push({ key: 'end', kind: 'end', title: 'Thanks, everyone' });
  return deck;
}

// Answer key for a question slide (server-side only).
export function answerFor(slideKey: string): { correct: number; explanation: string; options: number } | null {
  const m = slideKey.match(/^([a-z]+\d+)\.(q|sim)(\d+)$/);
  if (!m) return null;
  const [, id, kind, n] = m;
  if (kind === 'q') {
    const qq = quizFor(id)[Number(n) - 1];
    return qq ? { correct: qq.correct, explanation: qq.why, options: qq.options.length } : null;
  }
  const s = simFor(id)?.steps[Number(n) - 1];
  return s ? { correct: s.best, explanation: s.feedback, options: s.options.length } : null;
}

export function needsAnswers() {
  const out: Array<{ pathName: string; moduleId: string; moduleTitle: string; where: string; text: string }> = [];
  const scan = (pathName: string, m: TradeModule, where: string, text: string) => {
    const surrounding = text.replace(/\[(CONFIRM|VERIFY)[^\]]*\]/g, '').trim();
    for (const hit of text.matchAll(/\[(CONFIRM|VERIFY)([^\]]*)\]/g)) {
      const detail = (hit[2] || '').replace(/^[:\s]+/, '').trim();
      out.push({ pathName, moduleId: m.id, moduleTitle: m.title, where, text: `${hit[1]}: ${detail || surrounding}` });
    }
  };
  for (const p of paths) {
    for (const m of p.modules) {
      m.key_points.forEach((k) => scan(p.name, m, 'Key point', k));
      m.lessons.forEach((l) => scan(p.name, m, 'Lesson', l));
      (m.signoff ?? []).forEach((s) => scan(p.name, m, 'Sign-off', s));
      (m.confirm ?? []).forEach((c) => out.push({ pathName: p.name, moduleId: m.id, moduleTitle: m.title, where: 'To confirm', text: c }));
    }
  }
  for (const q of program.open_questions ?? []) out.push({ pathName: 'Program', moduleId: '', moduleTitle: 'Open question', where: 'Program', text: q });
  return out;
}
