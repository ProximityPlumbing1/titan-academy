import { describe, expect, it } from 'vitest';
import { splitMarkers } from '../shared/types';
import { answerFor, classDeck, modulesForRole, moduleSlides, needsAnswers, quizFor } from '../server/content';

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

  it('has a valid answer key for every drafted question', () => {
    for (const id of ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'x1', 'x2']) {
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
