import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { isQuestion, type ClassSummary } from '../../../shared/types';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { PhoneSlide, Stage, TvSlide, slideSummary } from '../slides';
import { useLive, type Conn } from '../useLive';
import { Badge, Button, Card, ErrorNote, Loading, Logo, Modal, Qr } from '../ui';
import { PhoneShell } from './learner';

function ConnDot({ conn }: { conn: Conn }) {
  const map = { live: ['bg-good', 'Live'], polling: ['bg-amber', 'Reconnecting'], connecting: ['bg-faint', 'Connecting'] } as const;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={`h-2 w-2 rounded-full ${map[conn][0]} ${conn === 'live' ? 'animate-pulse' : ''}`} />{map[conn][1]}
    </span>
  );
}

function SummaryView({ summary }: { summary: ClassSummary }) {
  return (
    <div className="space-y-3">
      <p><b>{summary.attended}</b> attended{summary.names.length ? `: ${summary.names.join(', ')}` : ''}.</p>
      {summary.modules.map((m) => (
        <Card key={m.moduleId} className="p-4">
          <div className="font-semibold">{m.title}</div>
          <div className="text-sm text-muted">
            {m.questions ? `Average quiz score: ${m.averageScore ?? '—'}%` : 'No quiz in this module. Lessons credited.'}
          </div>
          {m.needRetake.length > 0 && <div className="mt-1 text-sm text-amber">Need to retake on their phone: {m.needRetake.join(', ')}</div>}
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- tech's phone
export function FollowPage() {
  const { code = '' } = useParams();
  const loc = useLocation();
  const { init, state, ended, error, notice, conn, send } = useLive(code, 'follow');
  const [pending, setPending] = useState<number | null>(null);
  const slide = init && state ? init.deck[state.slide] : undefined;
  useEffect(() => setPending(null), [slide?.key, state?.myAnswer]);
  if (error?.status === 401) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (ended)
    return (
      <PhoneShell back="/">
        <h1 className="headline text-3xl">Class finished</h1>
        <p className="mb-5 mt-2 text-muted">Thanks for joining. Your progress has been saved.</p>
        <Link to="/"><Button className="w-full" size="lg">Back to my training</Button></Link>
      </PhoneShell>
    );
  if (error && !init)
    return (
      <PhoneShell back="/">
        <h1 className="headline text-3xl">Class {code}</h1>
        <p className="mt-2 text-muted">{error.status === 404 ? "This class hasn't started yet. This page will join as soon as it does." : error.message}</p>
      </PhoneShell>
    );
  if (!init || !state) return <Loading label="Joining class…" />;
  const answer = (choice: number) => {
    if (!isQuestion(slide)) return;
    setPending(choice);
    void send({ type: 'answer', key: slide.key, choice });
  };
  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 pb-16 pt-[max(14px,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{init.title}</div>
          <div className="text-xs text-faint">Class {init.code} · slide {state.slide + 1} of {init.deck.length}</div>
        </div>
        <ConnDot conn={conn} />
      </header>
      {notice && <div className="mb-4 rounded-xl bg-amber/15 px-4 py-2 text-sm text-amber">{notice}</div>}
      <PhoneSlide slide={slide} state={state} onAnswer={answer} pending={pending} />
    </div>
  );
}

// ---------------------------------------------------------------- the TV
export function TvPage() {
  const { code = '' } = useParams();
  const { init, state, ended, error, conn } = useLive(code, 'tv');
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  const full = () => document.documentElement.requestFullscreen?.().catch(() => {});
  if (ended)
    return (
      <Stage className="theme-dark h-screen w-screen">
        <div className="flex h-full flex-col items-center justify-center text-center text-white">
          <div className="text-[30px] font-bold uppercase tracking-[0.2em] text-link">Class complete</div>
          <h1 className="headline mt-6 text-[130px]">Thanks, everyone</h1>
          <p className="mt-8 text-[44px] text-muted">{ended.attended} attended · progress saved</p>
        </div>
      </Stage>
    );
  if (!init || !state)
    return (
      <Stage className="theme-dark h-screen w-screen">
        <div className="flex h-full flex-col items-center justify-center text-center text-white">
          <div className="scale-[2.4]"><Logo /></div>
          <p className="mt-32 text-[48px] text-muted">{error?.status === 404 ? `Waiting for class ${code} to start…` : 'Connecting…'}</p>
        </div>
      </Stage>
    );
  return (
    <div className="theme-dark h-screen w-screen" onDoubleClick={full} title="Double-click for full screen">
      <Stage className="h-full w-full">
        <TvSlide slide={init.deck[state.slide]} state={state} code={init.code} joinUrl={init.joinUrl} />
      </Stage>
      {conn !== 'live' && <div className="fixed right-3 top-3 rounded-full bg-amber/20 px-3 py-1 text-xs text-amber">Reconnecting…</div>}
    </div>
  );
}

// ---------------------------------------------------------------- presenter
export function PresentPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const cls = useApi<{ class: any; slideCount: number }>(`/api/admin/classes/${id}`);
  const [code, setCode] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  useEffect(() => {
    if (cls.data?.class.status === 'live') setCode(cls.data.class.join_code);
  }, [cls.data]);
  const start = async () => {
    try {
      const r = await api<{ code: string }>(`/api/admin/classes/${id}/start`, { body: {} });
      setCode(r.code);
    } catch (e) {
      setStartError((e as Error).message);
    }
  };
  if (cls.loading) return <Loading />;
  if (cls.error || !cls.data) return <div className="p-6"><ErrorNote error={cls.error?.message} /></div>;
  const c = cls.data.class;
  if (c.status === 'ended')
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Link to="/admin/classes" className="text-muted">← Classes</Link>
        <h1 className="headline mt-4 text-3xl">{c.title}</h1>
        <p className="mb-4 text-muted">This class has ended.</p>
        {c.summary && <SummaryView summary={c.summary} />}
      </div>
    );
  if (!code)
    return (
      <div className="mx-auto max-w-xl p-6">
        <Link to="/admin/classes" className="text-muted">← Classes</Link>
        <Card className="mt-6 p-6">
          <div className="eyebrow mb-2">Ready to present</div>
          <h1 className="headline text-3xl">{c.title}</h1>
          <p className="mt-2 text-muted">{cls.data.slideCount} slides · {c.module_ids.join(', ')}</p>
          <p className="mt-4 text-sm text-muted">Going live creates a 4-digit join code. Then open the TV view on the big screen and ask everyone to join on their phones.</p>
          <ErrorNote error={startError} />
          <Button size="lg" className="mt-6 w-full" onClick={start}>Go live</Button>
        </Card>
        {user && !user.isTrainer && !user.isAdmin && <p className="mt-4 text-sm text-amber">You need trainer access to present.</p>}
      </div>
    );
  return <PresenterConsole code={code} />;
}

function PresenterConsole({ code }: { code: string }) {
  const { init, state, ended, notice, conn, send } = useLive(code, 'present');
  const [showEnd, setShowEnd] = useState(false);
  const [people, setPeople] = useState<Array<{ id: string; name: string }> | null>(null);
  const control = useCallback((action: string, extra: Record<string, unknown> = {}) => void send({ type: 'control', action, ...extra }), [send]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); control('next'); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); control('prev'); }
      if (e.key === 'r' || e.key === 'R') control('reveal');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [control]);

  const openTv = () => window.open(`/tv/${code}`, 'titan-tv', 'popup,width=1280,height=720');
  const loadPeople = async () => setPeople((await api<{ people: Array<{ id: string; name: string }> }>(`/api/live/${code}/people`)).people);

  if (ended)
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Link to="/admin/classes" className="text-muted">← Classes</Link>
        <h1 className="headline mt-4 text-3xl">Class finished</h1>
        <p className="mb-4 text-muted">Attendance and scores are saved.</p>
        <SummaryView summary={ended} />
      </div>
    );
  if (!init || !state) return <Loading label="Connecting to class…" />;
  const slide = init.deck[state.slide];
  const next = init.deck[state.slide + 1];
  const q = isQuestion(slide);
  const notAnswered = (state.presence ?? []).filter((p) => !p.answered).map((p) => p.name);

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="lg" onClick={() => control('prev')} disabled={state.slide === 0}>← Back</Button>
      <Button size="lg" onClick={() => control('next')} disabled={state.slide >= init.deck.length - 1} className="min-w-40">Next →</Button>
      {q && state.phase === 'open' && <Button variant="gold" size="lg" onClick={() => control('reveal')}>Reveal answer</Button>}
      {q && state.phase === 'reveal' && <Button variant="subtle" size="lg" onClick={() => control('reopen')}>Reopen question</Button>}
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop console */}
      <div className="hidden min-h-screen grid-cols-[1fr_380px] gap-5 p-5 lg:grid">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/admin/classes" className="text-muted">← Classes</Link>
              <div className="font-semibold">{init.title}</div>
              <ConnDot conn={conn} />
            </div>
            <div className="text-sm text-muted">Slide {state.slide + 1} of {init.deck.length} · keys: ← → space, R to reveal</div>
          </div>
          <Stage className="theme-dark aspect-video w-full rounded-[20px] shadow-panel">
            <TvSlide slide={slide} state={state} code={init.code} joinUrl={init.joinUrl} presenter slideNumber={state.slide + 1} slideCount={init.deck.length} />
          </Stage>
          {controls}
          {notice && <div className="rounded-xl bg-amber/15 px-4 py-2 text-sm text-amber">{notice}</div>}
          <select className="w-full rounded-[6px] border border-line bg-card px-3 py-2.5 text-sm text-title" value={state.slide}
            onChange={(e) => control('goto', { index: Number(e.target.value) })}>
            {init.deck.map((s, i) => <option key={s.key} value={i}>{i + 1}. {slideSummary(s).slice(0, 110)}</option>)}
          </select>
        </div>
        <aside className="flex flex-col gap-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-muted">Join code</div>
                <div className="text-5xl font-extrabold tracking-[0.15em] text-gold">{init.code}</div>
              </div>
              <Qr value={init.joinUrl} className="h-24 w-24" />
            </div>
            <Button className="mt-4 w-full" onClick={openTv}>Open TV view</Button>
            <p className="mt-2 text-xs text-faint">Drag the TV window onto the big screen and press F11, or open <b>{location.host}/tv/{init.code}</b> in the TV's own browser.</p>
          </Card>
          {q && (
            <Card className="p-5">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted">Answers</div>
              <div className="mt-1 text-3xl font-extrabold text-title">{state.answered} <span className="text-lg text-muted">of {state.attendees}</span></div>
              {notAnswered.length > 0 && state.phase === 'open' && <div className="mt-2 text-sm text-muted">Waiting on: {notAnswered.join(', ')}</div>}
            </Card>
          )}
          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted">In the room ({state.attendees})</div>
              <button className="text-xs text-link" onClick={loadPeople}>+ Tick someone in</button>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {(state.presence ?? []).map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-good' : 'bg-faint'}`} />
                  <span className="flex-1">{p.name}</span>
                  {p.manual && <Badge>ticked in</Badge>}
                  {q && p.answered && <span className="text-good">✓</span>}
                </div>
              ))}
              {!state.presence?.length && <div className="text-sm text-faint">Nobody has joined yet.</div>}
            </div>
          </Card>
          {next && (
            <Card className="p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Next slide</div>
              <Stage className="aspect-video w-full rounded-xl"><TvSlide slide={next} presenter /></Stage>
            </Card>
          )}
          <Button variant="danger" onClick={() => setShowEnd(true)}>End class</Button>
        </aside>
      </div>

      {/* Phone remote */}
      <div className="mx-auto max-w-md p-4 lg:hidden">
        <div className="mb-3 flex items-center justify-between">
          <Link to="/admin/classes" className="text-muted">← Classes</Link>
          <ConnDot conn={conn} />
        </div>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="truncate font-semibold">{init.title}</div>
              <div className="text-xs text-muted">Slide {state.slide + 1} of {init.deck.length}</div>
            </div>
            <div className="text-3xl font-extrabold tracking-[0.12em] text-gold">{init.code}</div>
          </div>
        </Card>
        <Stage className="theme-dark mt-3 aspect-video w-full rounded-[12px] shadow-panel">
          <TvSlide slide={slide} state={state} code={init.code} joinUrl={init.joinUrl} presenter />
        </Stage>
        <p className="mt-2 text-sm text-muted">{slideSummary(slide)}</p>
        {q && <p className="mt-1 text-lg font-bold text-title">{state.answered} of {state.attendees} answered</p>}
        {notice && <div className="mt-2 rounded-xl bg-amber/15 px-4 py-2 text-sm text-amber">{notice}</div>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="ghost" className="h-24 text-xl" onClick={() => control('prev')} disabled={state.slide === 0}>← Back</Button>
          <Button className="h-24 text-xl" onClick={() => control('next')} disabled={state.slide >= init.deck.length - 1}>Next →</Button>
        </div>
        {q && state.phase === 'open' && <Button variant="gold" size="lg" className="mt-3 w-full" onClick={() => control('reveal')}>Reveal answer</Button>}
        {q && state.phase === 'reveal' && <Button variant="subtle" size="lg" className="mt-3 w-full" onClick={() => control('reopen')}>Reopen question</Button>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="subtle" onClick={openTv}>Open TV view</Button>
          <Button variant="danger" onClick={() => setShowEnd(true)}>End class</Button>
        </div>
        <p className="mt-3 text-xs text-faint">TV: open {location.host}/tv/{init.code} on the TV's browser.</p>
      </div>

      {showEnd && (
        <Modal title="End this class?" onClose={() => setShowEnd(false)}>
          <p className="mb-5 text-muted">Attendance is recorded, lessons are credited to everyone who attended, and each tech's live quiz score is saved.</p>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setShowEnd(false)}>Keep going</Button>
            <Button variant="danger" className="flex-1" onClick={() => { setShowEnd(false); control('end'); }}>End class</Button>
          </div>
        </Modal>
      )}
      {people && (
        <Modal title="Tick someone in" onClose={() => setPeople(null)}>
          <p className="mb-3 text-sm text-muted">For anyone in the room without a phone. They're marked as attended and do the quiz later.</p>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {people.map((p) => (
              <button key={p.id} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-tone/5"
                onClick={() => { control('attend', { userId: p.id }); setPeople((list) => list?.filter((x) => x.id !== p.id) ?? null); }}>
                {p.name}
              </button>
            ))}
            {!people.length && <p className="text-sm text-faint">Everyone in this group is already in.</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
