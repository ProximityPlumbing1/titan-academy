// Types shared by the server and the web app. Keep this file free of imports.

interface SlideBase {
  key: string;
  moduleId?: string;
  moduleTitle?: string;
  pathName?: string;
}

export type Slide =
  | (SlideBase & { kind: 'welcome'; title: string; subtitle: string })
  | (SlideBase & { kind: 'title'; objective: string; label: string })
  | (SlideBase & { kind: 'covers'; lessons: string[] })
  | (SlideBase & { kind: 'point'; lead: string; detail: string; bullets: string[]; index: number; total: number })
  | (SlideBase & {
      kind: 'quiz'; number: number; total: number; question: string; options: string[];
      correct?: number; why?: string;
    })
  | (SlideBase & {
      kind: 'sim'; persona: string; scenario: string; step: number; total: number; them: string; options: string[];
      correct?: number; feedback?: string;
    })
  | (SlideBase & { kind: 'onjob'; text: string; lesson: string })
  | (SlideBase & { kind: 'signoff'; items: string[]; assessor?: string })
  | (SlideBase & { kind: 'recap'; points: string[] })
  | (SlideBase & { kind: 'end'; title: string });

export type SlideKind = Slide['kind'];

export type LessonBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; kind: 'onjob' | 'say' | 'note'; text: string };

export interface Lesson { title: string; blocks: LessonBlock[] }
export type Phase = 'show' | 'open' | 'reveal';

export interface Reveal {
  correct: number;
  counts: number[];
  answered: number;
  explanation?: string;
}

export interface PresenceEntry { id: string; name: string; connected: boolean; answered: boolean; manual: boolean }

export interface LiveInit {
  type: 'init';
  role: 'present' | 'follow' | 'tv';
  classId: string;
  title: string;
  code: string;
  joinUrl: string;
  deck: Slide[];
}

export interface LiveState {
  type: 'state';
  slide: number;
  phase: Phase;
  answered: number;
  attendees: number;
  reveal?: Reveal;
  myAnswer?: number | null;
  presence?: PresenceEntry[];
}

export interface LiveEnded {
  type: 'ended';
  summary: ClassSummary;
}

export interface ClassSummary {
  attended: number;
  names: string[];
  modules: Array<{ moduleId: string; title: string; questions: number; averageScore: number | null; needRetake: string[] }>;
}

export type LiveMessage = LiveInit | LiveState | LiveEnded | { type: 'error'; message: string };

export function isQuestion(s: Slide | undefined): s is Extract<Slide, { kind: 'quiz' | 'sim' }> {
  return !!s && (s.kind === 'quiz' || s.kind === 'sim');
}

// Splits text into plain parts and [CONFIRM ...] / [VERIFY ...] markers so UIs can style them.
export function splitMarkers(text: string): Array<{ text: string; marker?: 'CONFIRM' | 'VERIFY' }> {
  const out: Array<{ text: string; marker?: 'CONFIRM' | 'VERIFY' }> = [];
  const re = /\[(CONFIRM|VERIFY)([^\]]*)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[2].replace(/^[:\s]+/, '').trim(), marker: m[1] as 'CONFIRM' | 'VERIFY' });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export const GROUPS: Array<{ id: string; name: string }> = [
  { id: 'all', name: 'Everyone' },
  { id: 'field', name: 'Install + Service' },
  { id: 'install', name: 'Install' },
  { id: 'service', name: 'Service' },
  { id: 'sales', name: 'Sales' },
];
