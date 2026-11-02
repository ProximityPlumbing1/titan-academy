import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { LessonBlock } from '../../../shared/types';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { canPresent, isStaff, useAuth } from '../auth';
import { Badge, Button, Card, ErrorNote, Loading, Logo, Marked, Ring, firstName } from '../ui';

interface Overview {
  paths: Array<{ id: string; name: string; summary: string; modules: Array<{ id: string; title: string; objective: string; lessonCount: number; lessonsWritten: number; quizLength: number; status: 'done' | 'started' | 'none' }> }>;
  done: number; total: number;
  live: Array<{ id: string; title: string; code: string }>;
}

export function PhoneShell({ children, back }: { children: ReactNode; back?: string }) {
  const { user, logout } = useAuth();
  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 pb-16 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="mb-5 flex items-center justify-between">
        {back ? <Link to={back} className="rounded-lg py-2 pr-3 text-muted">← Back</Link> : <Logo small />}
        {user && (
          <div className="flex items-center gap-2">
            {isStaff(user) && <Link to="/admin" className="rounded-lg px-3 py-2 text-sm text-cyan hover:bg-white/5">Admin</Link>}
            <button onClick={logout} className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-white/5">Sign out</button>
          </div>
        )}
      </header>
      {children}
    </div>
  );
}

const STATUS = {
  done: { icon: '✓', cls: 'bg-good text-ink', label: 'Done' },
  started: { icon: '●', cls: 'bg-amber/20 text-amber', label: 'Started' },
  none: { icon: '', cls: 'bg-white/8 text-faint', label: '' },
};

export function HomePage() {
  const { user } = useAuth();
  const { data, error, loading } = useApi<Overview>('/api/me/overview');
  if (loading) return <Loading />;
  if (error || !data) return <PhoneShell><ErrorNote error={error?.message} /></PhoneShell>;
  const pct = data.total ? data.done / data.total : 0;
  const nextUp = data.paths.flatMap((p) => p.modules).find((m) => m.status !== 'done');
  return (
    <PhoneShell>
      {data.live.map((c) => (
        <Link key={c.id} to={`/live/${c.code}`} className="mb-4 block rounded-2xl bg-cyan p-4 text-ink shadow-lg fade-in">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest"><span className="h-2 w-2 animate-pulse rounded-full bg-ink" /> Live now</div>
          <div className="mt-1 text-lg font-bold">{c.title}</div>
          <div className="mt-2 inline-block rounded-xl bg-ink px-4 py-2 font-semibold text-white">Join class →</div>
        </Link>
      ))}
      <div className="mb-6 flex items-center gap-5">
        <Ring pct={pct} size={92}><span className="text-xl font-bold">{Math.round(pct * 100)}%</span></Ring>
        <div>
          <h1 className="headline text-3xl">Hi {firstName(user!.name)}</h1>
          <p className="text-sm text-muted">
            {data.total ? `${data.done} of ${data.total} modules done` : 'No training path on your account.'}
          </p>
          <Link to="/join" className="mt-1 inline-block text-sm text-cyan">Join a class with a code</Link>
        </div>
      </div>
      {!data.total && isStaff(user) && (
        <Card className="mb-6 p-5">
          <p className="mb-4 text-muted">You're set up as office staff. Run classes and manage the team from the admin area.</p>
          <div className="flex flex-wrap gap-3">
            <Link to="/admin"><Button>Open admin</Button></Link>
            {canPresent(user) && <Link to="/admin/classes"><Button variant="ghost">Start a class</Button></Link>}
          </div>
        </Card>
      )}
      {nextUp && (
        <Link to={`/module/${nextUp.id}`} className="mb-6 block">
          <Card className="p-5 transition hover:border-blue2">
            <div className="eyebrow mb-1">Up next</div>
            <div className="text-lg font-bold">{nextUp.title}</div>
            <p className="mt-1 text-sm text-muted"><Marked text={nextUp.objective} compact /></p>
          </Card>
        </Link>
      )}
      {data.paths.map((p) => (
        <section key={p.id} className="mb-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-muted">{p.name}</h2>
          <Card className="divide-y divide-line">
            {p.modules.map((m, i) => (
              <Link key={m.id} to={`/module/${m.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03]">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${STATUS[m.status].cls}`}>
                  {STATUS[m.status].icon || i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.title}</span>
                  <span className="text-xs text-faint">{[m.lessonsWritten ? `${m.lessonsWritten} lessons to read` : '', m.quizLength ? `Quiz · ${m.quizLength} questions` : ''].filter(Boolean).join(' · ') || 'Covered in class'}</span>
                </span>
                {m.status === 'started' && <Badge tone="amber">Started</Badge>}
                <span className="text-faint">›</span>
              </Link>
            ))}
          </Card>
        </section>
      ))}
    </PhoneShell>
  );
}

interface ModuleData {
  module: { id: string; title: string; objective: string; pathName: string; position: number; moduleCount: number; lessons: string[]; keyPoints: string[]; signoff: string[]; assessor: string | null; quizLength: number; lessonsWritten: number };
  status: 'done' | 'started' | 'none'; best: number | null; attempts: number; doneLessons: number[];
}

export function ModulePage() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useApi<ModuleData>(`/api/modules/${id}`);
  const [busy, setBusy] = useState(false);
  if (loading) return <Loading />;
  if (error || !data) return <PhoneShell back="/"><ErrorNote error={error?.message} /></PhoneShell>;
  const m = data.module;
  const done = new Set(data.doneLessons);
  const firstUnread = m.lessons.findIndex((_, i) => i < m.lessonsWritten && !done.has(i));
  const markRead = async () => {
    setBusy(true);
    await api(`/api/modules/${id}/read`, { body: {} }).catch(() => {});
    setBusy(false);
    void reload();
  };
  return (
    <PhoneShell back="/">
      <div className="eyebrow mb-2">{m.pathName} · Module {m.position} of {m.moduleCount}</div>
      <h1 className="headline text-3xl leading-tight">{m.title}</h1>
      <p className="mt-3 text-muted"><Marked text={m.objective} /></p>
      <div className="mt-4 flex flex-wrap gap-2">
        {data.status === 'done' && <Badge tone="good">✓ Done</Badge>}
        {data.best !== null && <Badge tone={data.best >= 80 ? 'good' : 'amber'}>Best quiz score {data.best}%</Badge>}
      </div>

      <section className="mt-7">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted">{m.lessonsWritten ? `Lessons · ${[...done].filter((i) => i < m.lessonsWritten).length} of ${m.lessonsWritten} read` : 'What this module covers'}</h2>
        {m.lessonsWritten > 0 ? (
          <Card className="divide-y divide-line">
            {m.lessons.map((l, i) => i < m.lessonsWritten ? (
              <Link key={i} to={`/module/${id}/lesson/${i + 1}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03]">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done.has(i) ? 'bg-good text-ink' : 'bg-white/8 text-faint'}`}>{done.has(i) ? '✓' : i + 1}</span>
                <span className="min-w-0 flex-1 text-[15px] leading-snug"><Marked text={l} compact /></span>
                <span className="text-faint">›</span>
              </Link>
            ) : (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 text-muted">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-sm text-faint">{i + 1}</span>
                <span className="min-w-0 flex-1 text-[15px] leading-snug"><Marked text={l} compact /></span>
              </div>
            ))}
          </Card>
        ) : (
          <>
            <ol className="space-y-2 text-[15px]">
              {m.lessons.map((l, i) => <li key={i} className="flex gap-3"><span className="text-faint">{i + 1}.</span><Marked text={l} /></li>)}
            </ol>
            <p className="mt-3 text-xs text-faint">These lessons are taught in your live class. The written versions are being added.</p>
          </>
        )}
      </section>

      <section className="mt-7">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted">Key points</h2>
        <div className="space-y-3">
          {m.keyPoints.map((k, i) => (
            <Card key={i} className="p-4"><div className="flex gap-3"><b className="headline text-gold">{i + 1}</b><p className="leading-relaxed"><Marked text={k} /></p></div></Card>
          ))}
        </div>
      </section>

      {m.signoff.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted">On the job: sign-offs</h2>
          <Card className="p-4">
            <ul className="space-y-2">{m.signoff.map((s, i) => <li key={i}>☐ <Marked text={s} /></li>)}</ul>
            {m.assessor && <p className="mt-3 text-sm text-muted">Signed off by: <Marked text={m.assessor} /></p>}
          </Card>
        </section>
      )}

      <div className="sticky bottom-4 mt-8 space-y-3">
        {firstUnread >= 0 && (
          <Link to={`/module/${id}/lesson/${firstUnread + 1}`} className="block">
            <Button size="lg" variant={m.quizLength > 0 ? 'ghost' : 'primary'} className={`w-full shadow-xl ${m.quizLength > 0 ? 'bg-ink' : ''}`}>{done.size ? 'Continue reading' : 'Start reading'} · lesson {firstUnread + 1}</Button>
          </Link>
        )}
        {m.quizLength > 0 ? (
          <Link to={`/module/${id}/quiz`}>
            <Button size="lg" className="w-full shadow-xl">{data.status === 'done' ? 'Retake the quiz' : `Take the quiz · ${m.quizLength} questions`}</Button>
          </Link>
        ) : data.status !== 'done' ? (
          <Button size="lg" variant="ghost" className="w-full bg-ink" onClick={markRead} disabled={busy}>I've read this module</Button>
        ) : null}
      </div>
    </PhoneShell>
  );
}

interface LessonData {
  moduleId: string; moduleTitle: string; pathName: string; index: number; total: number; written: number;
  title: string; blocks: LessonBlock[]; status: string | null; done: boolean; quizLength: number;
}

export function LessonBlocks({ blocks }: { blocks: LessonBlock[] }) {
  return (
    <div className="space-y-4 text-[16px] leading-relaxed">
      {blocks.map((b, i) => {
        if (b.type === 'p') return <p key={i}><Marked text={b.text} /></p>;
        if (b.type === 'ul' || b.type === 'ol') {
          const Tag = b.type;
          return (
            <Tag key={i} className="space-y-2 pl-1">
              {b.items.map((t, j) => (
                <li key={j} className="flex gap-3">
                  <span className={b.type === 'ol' ? 'font-bold text-gold' : 'text-cyan'}>{b.type === 'ol' ? `${j + 1}.` : '•'}</span>
                  <span><Marked text={t} /></span>
                </li>
              ))}
            </Tag>
          );
        }
        const style = b.kind === 'say'
          ? { box: 'border-cyan bg-cyan/[0.07]', label: 'Say it like this', labelCls: 'text-cyan' }
          : b.kind === 'onjob'
            ? { box: 'border-gold bg-gold/[0.07]', label: 'On the job', labelCls: 'text-gold' }
            : { box: 'border-line bg-white/[0.03]', label: '', labelCls: '' };
        return (
          <div key={i} className={`rounded-xl border-l-4 p-4 ${style.box}`}>
            {style.label && <div className={`mb-1 text-[11px] font-bold uppercase tracking-[0.18em] ${style.labelCls}`}>{style.label}</div>}
            <p className={b.kind === 'say' ? 'italic' : ''}><Marked text={b.text} /></p>
          </div>
        );
      })}
    </div>
  );
}

export function LessonPage() {
  const { id = '', n = '1' } = useParams();
  const idx = Math.max(0, Number(n) - 1);
  const navigate = useNavigate();
  const { data, error, loading } = useApi<LessonData>(`/api/modules/${id}/lessons/${idx}`);
  const [busy, setBusy] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); }, [idx]);
  if (loading) return <Loading />;
  if (error || !data) return <PhoneShell back={`/module/${id}`}><ErrorNote error={error?.message} /></PhoneShell>;
  const hasNext = idx + 1 < data.written;
  const finish = async () => {
    setBusy(true);
    try {
      await api(`/api/modules/${id}/lessons/${idx}/done`, { body: {} });
      navigate(hasNext ? `/module/${id}/lesson/${idx + 2}` : `/module/${id}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PhoneShell back={`/module/${id}`}>
      <div className="eyebrow mb-2">{data.moduleTitle} · Lesson {idx + 1} of {data.total}</div>
      <div className="mb-5 flex gap-1">
        {Array.from({ length: data.total }, (_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < idx ? 'bg-blue2' : i === idx ? 'bg-cyan' : 'bg-white/10'}`} />
        ))}
      </div>
      <h1 className="headline mb-5 text-[28px] leading-tight"><Marked text={data.title} /></h1>
      {data.status?.startsWith('sample') && (
        <p className="mb-5 rounded-lg bg-amber/10 px-3 py-2 text-xs text-amber">Draft lesson, awaiting owner approval.</p>
      )}
      <LessonBlocks blocks={data.blocks} />
      <div className="mt-10 space-y-3">
        <Button size="lg" className="w-full" onClick={finish} disabled={busy}>
          {data.done ? (hasNext ? 'Next lesson →' : 'Back to module') : hasNext ? 'Done · next lesson →' : 'Done · back to module'}
        </Button>
        {!hasNext && data.quizLength > 0 && (
          <Link to={`/module/${id}/quiz`} className="block"><Button size="lg" variant="ghost" className="w-full">Take the quiz · {data.quizLength} questions</Button></Link>
        )}
        {idx > 0 && <Link to={`/module/${id}/lesson/${idx}`} className="block py-2 text-center text-sm text-muted">← Previous lesson</Link>}
      </div>
    </PhoneShell>
  );
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export function QuizPage() {
  const { id = '' } = useParams();
  const { data, error, loading } = useApi<{ questions: Array<{ q: string; options: string[] }> }>(`/api/modules/${id}/quiz`);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{ score: number; passed: boolean; results: Array<{ chosen: number | null; correct: number; why: string }> } | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading) return <Loading />;
  if (error || !data) return <PhoneShell back={`/module/${id}`}><ErrorNote error={error?.message} /></PhoneShell>;
  const qs = data.questions;
  if (result) {
    return (
      <PhoneShell back={`/module/${id}`}>
        <div className="mb-6 flex flex-col items-center text-center">
          <Ring pct={result.score / 100} size={140} color={result.passed ? 'var(--color-good)' : 'var(--color-amber)'}>
            <span className="text-3xl font-bold">{result.score}%</span>
          </Ring>
          <h1 className="headline mt-4 text-3xl">{result.passed ? 'Passed!' : 'Not yet'}</h1>
          <p className="mt-1 text-muted">{result.passed ? 'Module complete. Nice work.' : 'You need 80% to pass. Read the explanations and try again.'}</p>
        </div>
        <div className="space-y-3">
          {qs.map((q, n) => {
            const r = result.results[n];
            const ok = r.chosen === r.correct;
            return (
              <Card key={n} className={`p-4 ${ok ? '' : 'border-amber/40'}`}>
                <div className="mb-1 text-sm font-semibold">{ok ? '✓' : '✗'} {q.q}</div>
                {!ok && <div className="text-sm text-good">Answer: {q.options[r.correct]}</div>}
                <div className="mt-1 text-sm text-muted">{r.why}</div>
              </Card>
            );
          })}
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => { setResult(null); setAnswers([]); setI(0); }}>Try again</Button>
          <Link to="/" className="flex-1"><Button className="w-full">Home</Button></Link>
        </div>
      </PhoneShell>
    );
  }
  const q = qs[i];
  const chosen = answers[i];
  const submit = async () => {
    setBusy(true);
    try {
      setResult(await api(`/api/modules/${id}/quiz`, { body: { answers } }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PhoneShell back={`/module/${id}`}>
      <div className="mb-4 flex items-center gap-2">
        {qs.map((_, n) => <span key={n} className={`h-1.5 flex-1 rounded-full ${n < i ? 'bg-blue2' : n === i ? 'bg-white' : 'bg-white/10'}`} />)}
      </div>
      <div className="eyebrow mb-2">Question {i + 1} of {qs.length}</div>
      <h1 className="headline text-2xl leading-snug">{q.q}</h1>
      <div className="mt-5 space-y-3">
        {q.options.map((o, n) => (
          <button key={n} onClick={() => setAnswers((a) => { const c = [...a]; c[i] = n; return c; })}
            className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-4 text-left transition ${chosen === n ? 'border-blue2 bg-blue/25' : 'border-line bg-panel'}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 font-extrabold">{LETTERS[n]}</span>
            <span className="pt-1">{o}</span>
          </button>
        ))}
      </div>
      <div className="mt-6 flex gap-3">
        {i > 0 && <Button variant="ghost" onClick={() => setI(i - 1)}>Back</Button>}
        {i < qs.length - 1 ? (
          <Button className="flex-1" size="lg" disabled={chosen === undefined} onClick={() => setI(i + 1)}>Next</Button>
        ) : (
          <Button className="flex-1" size="lg" disabled={chosen === undefined || busy} onClick={submit}>{busy ? 'Marking…' : 'Finish'}</Button>
        )}
      </div>
    </PhoneShell>
  );
}

export function JoinPage() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (/^\d{4}$/.test(code)) nav(`/live/${code}`);
  };
  return (
    <PhoneShell back="/">
      <h1 className="headline text-3xl">Join a class</h1>
      <p className="mt-2 text-muted">Type the 4-digit code shown on the TV.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoFocus placeholder="0000"
          className="w-full rounded-2xl border border-line bg-ink py-5 text-center text-5xl font-extrabold tracking-[0.4em] text-gold placeholder:text-white/10 focus:border-blue2 focus:outline-none" />
        <Button size="lg" className="w-full" disabled={code.length !== 4}>Join</Button>
      </form>
    </PhoneShell>
  );
}
