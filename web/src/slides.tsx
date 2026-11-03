import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { LiveState, Reveal, Slide } from '../../shared/types';
import { isQuestion } from '../../shared/types';
import { Marked, Qr } from './ui';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// A fixed 1920×1080 canvas, scaled to fit its box. Same layout on an 80" 4K TV, a laptop or a thumbnail.
export function Stage({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      setScale(Math.min(r.width / 1920, r.height / 1080));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      <div
        style={{
          width: 1920, height: 1080, position: 'absolute', left: '50%', top: '50%',
          transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center', opacity: scale ? 1 : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface TvProps {
  slide: Slide | undefined;
  state?: LiveState | null;
  code?: string;
  joinUrl?: string;
  presenter?: boolean; // show answers + full [CONFIRM] text
  slideNumber?: number;
  slideCount?: number;
}

export function TvSlide({ slide, state, code, joinUrl, presenter, slideNumber, slideCount }: TvProps) {
  if (!slide) return <div className="h-full w-full bg-page" />;
  const reveal = state?.reveal;
  return (
    <div className="relative flex h-full w-full flex-col px-[120px] pb-[84px] pt-[90px] text-body"
      style={{ background: 'radial-gradient(1400px 700px at 15% -10%, rgba(0,173,237,.14), transparent 60%), linear-gradient(180deg, #ffffff 0%, #fafbfc 60%, #ecf9fe 100%)' }}>
      <div className="min-h-0 flex-1">
        <SlideBody slide={slide} reveal={reveal} state={state} presenter={presenter} code={code} joinUrl={joinUrl} />
      </div>
      <div className="mt-8 flex items-end justify-between text-[28px] text-faint">
        <div className="font-semibold tracking-[0.16em]">PROXIMITY PLUMBING · TITAN ACADEMY</div>
        <div className="flex items-center gap-8">
          {slideNumber !== undefined && slideCount !== undefined && <span>{slideNumber} / {slideCount}</span>}
          {code && slide.kind !== 'welcome' && (
            <span className="rounded-full bg-card px-6 py-2 text-title shadow-card">
              Join <b className="ml-2 tracking-[0.2em] text-gold">{code}</b>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="mb-8 text-[30px] font-bold uppercase tracking-[0.2em] text-link">{children}</div>;
}

function SlideBody({ slide, reveal, state, presenter, code, joinUrl }:
  { slide: Slide; reveal?: Reveal; state?: LiveState | null; presenter?: boolean; code?: string; joinUrl?: string }) {
  const compact = !presenter;
  switch (slide.kind) {
    case 'welcome':
      return (
        <div className="grid h-full grid-cols-[1fr_auto] items-center gap-24">
          <div>
            <Eyebrow>Titan Academy · Live class</Eyebrow>
            <h1 className="headline text-[104px] leading-[1.02]">{slide.title}</h1>
            <p className="mt-10 text-[46px] text-muted">Join on your phone:</p>
            {joinUrl && <p className="mt-3 text-[38px] font-semibold text-link">{joinUrl.replace(/^https?:\/\//, '').replace(/\/live\/\d+$/, '')} → Join</p>}
          </div>
          {code && (
            <div className="flex flex-col items-center gap-8">
              {joinUrl && <Qr value={joinUrl} className="h-[380px] w-[380px] p-5" />}
              <div className="text-[30px] font-semibold uppercase tracking-[0.2em] text-muted">Code</div>
              <div className="text-[150px] font-extrabold leading-none tracking-[0.12em] text-gold">{code}</div>
            </div>
          )}
        </div>
      );
    case 'title':
      return (
        <div className="flex h-full flex-col justify-center">
          <Eyebrow>{slide.label}</Eyebrow>
          <h1 className="headline max-w-[1500px] text-[110px] leading-[1.02]">{slide.moduleTitle}</h1>
          <p className="mt-12 max-w-[1450px] text-[46px] leading-snug text-muted"><Marked text={slide.objective} compact={compact} /></p>
        </div>
      );
    case 'covers':
      return (
        <div>
          <Eyebrow>{slide.moduleTitle} · What we'll cover</Eyebrow>
          <ul className={`grid gap-x-16 gap-y-6 ${slide.lessons.length > 5 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {slide.lessons.map((l, i) => (
              <li key={i} className="flex gap-6 text-[38px] leading-snug">
                <span className="mt-1 font-bold text-gold">{i + 1}</span>
                <span><Marked text={l} compact={compact} /></span>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'point':
      return (
        <div className="flex h-full flex-col justify-center">
          <Eyebrow>{slide.moduleTitle} · Key point {slide.index} of {slide.total}</Eyebrow>
          <h2 className="headline max-w-[1600px] text-[80px] leading-[1.08]"><Marked text={slide.lead} compact={compact} /></h2>
          {slide.detail && <p className="mt-10 max-w-[1550px] text-[42px] leading-snug text-muted"><Marked text={slide.detail} compact={compact} /></p>}
          {slide.bullets.length > 0 && (
            <ul className="mt-10 grid grid-cols-2 gap-x-14 gap-y-4">
              {slide.bullets.map((b, i) => (
                <li key={i} className="flex gap-4 text-[32px] leading-snug text-muted">
                  <span className="text-link">•</span><span><Marked text={b} compact={compact} /></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    case 'onjob':
      return (
        <div className="flex h-full flex-col justify-center">
          <Eyebrow>{slide.moduleTitle} · On the job</Eyebrow>
          <div className="max-w-[1600px] rounded-[28px] border-l-[10px] border-gold bg-tone/[0.04] px-16 py-14">
            <p className="text-[52px] leading-snug"><Marked text={slide.text} compact={compact} /></p>
          </div>
          <p className="mt-12 text-[36px] text-link">What would you do here?</p>
        </div>
      );
    case 'quiz':
    case 'sim':
      return <QuestionBody slide={slide} reveal={reveal} state={state} presenter={presenter} />;
    case 'signoff':
      return (
        <div>
          <Eyebrow>{slide.moduleTitle} · On the job this week</Eyebrow>
          <h2 className="headline mb-12 text-[72px]">You'll be signed off on:</h2>
          <ul className="space-y-6">
            {slide.items.map((s, i) => (
              <li key={i} className="flex gap-6 text-[40px] leading-snug"><span className="text-good">☐</span><Marked text={s} compact={compact} /></li>
            ))}
          </ul>
          {slide.assessor && <p className="mt-12 text-[32px] text-muted">Signed off by: <Marked text={slide.assessor} compact={compact} /></p>}
        </div>
      );
    case 'recap':
      return (
        <div className="flex h-full flex-col justify-center">
          <Eyebrow>{slide.moduleTitle} · Remember</Eyebrow>
          <ol className="space-y-10">
            {slide.points.map((p, i) => (
              <li key={i} className="flex gap-8 text-[50px] leading-snug">
                <span className="headline text-gold">{i + 1}</span><span><Marked text={p} compact={compact} /></span>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'certified':
      return <CertifiedWall code={code} />;
    case 'end':
      return (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <Eyebrow>Class complete</Eyebrow>
          <h1 className="headline text-[130px]">{slide.title}</h1>
          <p className="mt-10 text-[44px] text-muted">Your progress is saved in Titan Academy.</p>
        </div>
      );
  }
}

function QuestionBody({ slide, reveal, state, presenter }:
  { slide: Extract<Slide, { kind: 'quiz' | 'sim' }>; reveal?: Reveal; state?: LiveState | null; presenter?: boolean }) {
  const isSim = slide.kind === 'sim';
  const correct = reveal?.correct ?? (presenter ? slide.correct : undefined);
  const max = reveal ? Math.max(1, ...reveal.counts) : 1;
  const explanation = reveal?.explanation ?? (presenter ? (slide.kind === 'quiz' ? slide.why : slide.feedback) : undefined);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-10">
        <Eyebrow>
          {slide.moduleTitle} · {isSim ? `Role-play · step ${slide.step} of ${slide.total}` : `Question ${slide.number} of ${slide.total}`}
        </Eyebrow>
        {state && (
          <div className={`shrink-0 rounded-full px-7 py-3 text-[30px] font-semibold ${reveal ? 'bg-tone/10 text-muted' : 'bg-cyan/15 text-link'}`}>
            {reveal ? 'Answers revealed' : `${state.answered} of ${state.attendees} answered`}
          </div>
        )}
      </div>
      {isSim ? (
        <div className="mb-10">
          <div className="text-[34px] text-muted">{slide.persona} · {slide.scenario}</div>
          <h2 className="headline mt-6 text-[64px] leading-[1.1]">“{slide.them}”</h2>
        </div>
      ) : (
        <h2 className="headline mb-12 max-w-[1650px] text-[68px] leading-[1.1]">{slide.question}</h2>
      )}
      <div className="grid flex-1 grid-cols-2 content-start gap-6">
        {slide.options.map((o, i) => {
          const isRight = correct === i;
          const tone = correct === undefined ? 'border-line bg-card shadow-card' : isRight ? 'border-good bg-good/15' : 'border-tone/8 bg-tone/[0.02] opacity-60';
          const count = reveal?.counts[i] ?? 0;
          return (
            <div key={i} className={`relative overflow-hidden rounded-3xl border-2 px-9 py-7 ${tone}`}>
              {reveal && (
                <div className={`absolute inset-y-0 left-0 ${isRight ? 'bg-good/25' : 'bg-tone/8'}`} style={{ width: `${(count / max) * 100}%` }} />
              )}
              <div className="relative flex items-start gap-6">
                <span className={`flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-2xl text-[34px] font-extrabold ${isRight ? 'bg-good text-white' : 'bg-tone/5 text-title'}`}>{LETTERS[i]}</span>
                <span className="flex-1 pt-2 text-[36px] leading-snug">{o}</span>
                {reveal && <span className="pt-2 text-[34px] font-bold text-muted">{count}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {explanation && (reveal || presenter) && (
        <div className={`mt-6 rounded-3xl px-9 py-6 text-[34px] leading-snug ${reveal ? 'bg-good/10 text-title' : 'border border-dashed border-gold/50 text-gold'}`}>
          {!reveal && presenter && <b className="mr-3">Presenter only:</b>}{explanation}
        </div>
      )}
    </div>
  );
}

// Compact, readable version of the current slide for techs' phones.
export function PhoneSlide({ slide, state, onAnswer, pending }:
  { slide: Slide | undefined; state: LiveState | null; onAnswer: (choice: number) => void; pending: number | null }) {
  if (!slide) return null;
  const reveal = state?.reveal;
  if (isQuestion(slide)) {
    const mine = pending ?? state?.myAnswer ?? null;
    const open = state?.phase === 'open';
    return (
      <div className="fade-in" key={slide.key}>
        <div className="eyebrow mb-2">{slide.kind === 'sim' ? `Role-play · step ${slide.step}/${slide.total}` : `Question ${slide.number}/${slide.total}`}</div>
        {slide.kind === 'sim' ? (
          <>
            <div className="text-sm text-muted">{slide.persona}</div>
            <h2 className="headline mt-2 text-2xl leading-snug">“{slide.them}”</h2>
            <p className="mt-2 text-sm text-muted">What's your best response?</p>
          </>
        ) : (
          <h2 className="headline text-2xl leading-snug">{slide.question}</h2>
        )}
        <div className="mt-5 space-y-3">
          {slide.options.map((o, i) => {
            const chosen = mine === i;
            const right = reveal && reveal.correct === i;
            const wrong = reveal && chosen && reveal.correct !== i;
            const cls = right ? 'border-good bg-good/10' : wrong ? 'border-bad bg-bad/10' : chosen ? 'border-brand bg-soft' : 'border-line bg-card';
            return (
              <button key={i} disabled={!open} onClick={() => onAnswer(i)}
                className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-4 text-left text-base transition active:scale-[.99] disabled:cursor-default ${cls}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-extrabold ${right ? 'bg-good text-white' : chosen ? 'bg-brand text-white' : 'bg-tone/5 text-title'}`}>{LETTERS[i]}</span>
                <span className="pt-1">{o}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 text-center text-sm text-muted">
          {open && (mine === null ? 'Tap your answer. You can change it until the reveal.' : 'Answer in. You can change it until the reveal.')}
          {state?.phase === 'reveal' && reveal && (
            <div className={`rounded-2xl p-4 text-left text-base ${mine === reveal.correct ? 'bg-good/10 text-title' : 'bg-tone/5 text-title'}`}>
              <b>{mine === null ? 'No answer this time.' : mine === reveal.correct ? 'You got it.' : `The answer was ${LETTERS[reveal.correct]}.`}</b>
              {reveal.explanation && <p className="mt-1 text-muted">{reveal.explanation}</p>}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="fade-in" key={slide.key}>
      {slide.kind === 'welcome' && (
        <div className="py-10 text-center">
          <div className="text-5xl">📺</div>
          <h2 className="headline mt-4 text-3xl">You're in.</h2>
          <p className="mt-2 text-muted">Watch the TV. Questions will appear here.</p>
        </div>
      )}
      {slide.kind === 'title' && (
        <>
          <div className="eyebrow mb-2">{slide.label}</div>
          <h2 className="headline text-3xl leading-tight">{slide.moduleTitle}</h2>
          <p className="mt-3 text-muted"><Marked text={slide.objective} compact /></p>
        </>
      )}
      {slide.kind === 'covers' && (
        <>
          <div className="eyebrow mb-3">What we'll cover</div>
          <ol className="space-y-2">{slide.lessons.map((l, i) => <li key={i} className="flex gap-3"><b className="text-gold">{i + 1}</b><Marked text={l} compact /></li>)}</ol>
        </>
      )}
      {slide.kind === 'point' && (
        <>
          <div className="eyebrow mb-2">Key point {slide.index} of {slide.total}</div>
          <h2 className="headline text-2xl leading-snug"><Marked text={slide.lead} compact /></h2>
          {slide.detail && <p className="mt-3 text-muted"><Marked text={slide.detail} compact /></p>}
          {slide.bullets.length > 0 && <ul className="mt-3 space-y-1.5 text-sm text-muted">{slide.bullets.map((b, i) => <li key={i}>• <Marked text={b} compact /></li>)}</ul>}
        </>
      )}
      {slide.kind === 'onjob' && (
        <>
          <div className="eyebrow mb-2">On the job</div>
          <p className="rounded-xl border-l-4 border-gold bg-tone/[0.04] p-4 leading-relaxed"><Marked text={slide.text} compact /></p>
          <p className="mt-3 text-sm text-link">What would you do here?</p>
        </>
      )}
      {slide.kind === 'signoff' && (
        <>
          <div className="eyebrow mb-2">On the job this week</div>
          <ul className="space-y-2">{slide.items.map((s, i) => <li key={i}>☐ <Marked text={s} compact /></li>)}</ul>
        </>
      )}
      {slide.kind === 'recap' && (
        <>
          <div className="eyebrow mb-2">Remember</div>
          <ol className="space-y-3">{slide.points.map((p, i) => <li key={i} className="flex gap-3"><b className="headline text-gold">{i + 1}</b><Marked text={p} compact /></li>)}</ol>
        </>
      )}
      {slide.kind === 'certified' && (
        <div className="py-10 text-center">
          <div className="text-5xl">🏅</div>
          <h2 className="headline mt-4 text-3xl">Certified</h2>
          <p className="mt-2 text-muted">Watch the TV: names appear the moment someone certifies.</p>
        </div>
      )}
      {slide.kind === 'end' && (
        <div className="py-10 text-center">
          <h2 className="headline text-3xl">{slide.title}</h2>
          <p className="mt-2 text-muted">Your progress is saved.</p>
        </div>
      )}
    </div>
  );
}

export function slideSummary(s: Slide | undefined): string {
  if (!s) return '';
  switch (s.kind) {
    case 'welcome': return `Welcome · ${s.title}`;
    case 'title': return `Module · ${s.moduleTitle}`;
    case 'covers': return `What we'll cover · ${s.moduleTitle}`;
    case 'point': return `Key point ${s.index}: ${s.lead}`;
    case 'quiz': return `Q${s.number}: ${s.question}`;
    case 'sim': return `Role-play ${s.step}: “${s.them}”`;
    case 'onjob': return `On the job · ${s.text.slice(0, 60)}…`;
    case 'signoff': return `Sign-offs · ${s.moduleTitle}`;
    case 'certified': return 'Certified: names appear as people certify';
    case 'recap': return `Recap · ${s.moduleTitle}`;
    case 'end': return 'End';
  }
}

// Week 8: everyone certified so far. Refreshes every 5 seconds during the live class.
function CertifiedWall({ code }: { code?: string }) {
  const [names, setNames] = useState<Array<{ name: string; title: string }> | null>(null);
  useEffect(() => {
    if (!code) return;
    let stop = false;
    const load = () => fetch(`/api/live/${code}/certified`, { headers: { 'x-titan': '1' } })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (!stop && d) setNames(d.certified); }).catch(() => {});
    void load();
    const t = setInterval(load, 5000);
    return () => { stop = true; clearInterval(t); };
  }, [code]);
  const list = names ?? [];
  return (
    <div className="flex h-full flex-col">
      <Eyebrow>Week 8 · Final assessment</Eyebrow>
      <div className="flex items-end gap-8">
        <h1 className="headline text-[96px] leading-none">Certified</h1>
        <span className="mb-2 rounded-full bg-gold/15 px-6 py-1.5 text-[40px] font-extrabold text-gold">{list.length}</span>
      </div>
      {!code ? (
        <p className="mt-12 text-[40px] text-muted">Names appear here during the live class, the moment each person certifies.</p>
      ) : !list.length ? (
        <p className="mt-12 text-[40px] text-muted">The first names will appear here as people pass. Good luck, everyone.</p>
      ) : (
        <div className={`mt-12 grid gap-x-12 gap-y-6 ${list.length > 12 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {list.map((n) => (
            <div key={n.name} className="flex items-center gap-5 fade-in">
              <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-gold text-[30px] text-white">✓</span>
              <span className="min-w-0">
                <span className={`block truncate font-extrabold text-title ${list.length > 12 ? 'text-[38px]' : 'text-[46px]'}`}>{n.name}</span>
                <span className="block truncate text-[24px] text-muted">{n.title}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
