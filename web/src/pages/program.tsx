import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, formatWhen, timeAgo, useApi } from '../api';
import { useAuth } from '../auth';
import { Badge, Button, Card, ErrorNote, Field, Loading, Marked, Modal } from '../ui';
import { PhoneShell } from './learner';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const GROUP_LABELS: Record<string, string> = {
  field: 'Install + Service (weeks 1–2)', install: 'Install', service: 'Service', sales: 'Advanced Sales', all: 'Everyone (week 8)',
};
const fmtDate = (d: string) => new Date(`${d}T00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

// ================================================================ admin: 8-week program
interface ProgramData {
  program: { id: string; name: string; start_date: string; group_times: Record<string, { weekday: number; time: string }> } | null;
  classes: Array<{ id: string; title: string; group_id: string; module_ids: string[]; week: number; scheduled_at: string; status: string }>;
  week: number; today: string;
  defaults: { name: string; startDate: string };
}

export function ProgramPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<ProgramData>('/api/admin/program');
  const [moving, setMoving] = useState<ProgramData['classes'][number] | null>(null);
  const [ending, setEnding] = useState(false);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorNote error={error?.message} />;
  if (!data.program) return <CreateProgram defaults={data.defaults} canCreate={!!user?.isAdmin} onCreated={reload} />;
  const p = data.program;
  const weeks = [...new Set(data.classes.map((c) => c.week))].sort((a, b) => a - b);
  return (
    <div className="fade-in">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">8-week program</div>
          <h1 className="headline text-3xl">{p.name}</h1>
          <p className="mt-1 text-muted">
            Starts {fmtDate(p.start_date)} · {data.week === 0 ? 'not started yet' : data.week > 8 ? 'finished' : `week ${data.week} of 8 now`}
          </p>
        </div>
        {user?.isAdmin && <Button variant="ghost" onClick={() => setEnding(true)}>End this program</Button>}
      </div>
      <div className="space-y-5">
        {weeks.map((w) => (
          <Card key={w} className={`p-5 ${w === data.week ? 'shadow-[inset_0_0_0_2px_var(--color-brand),var(--shadow-card)]' : ''}`}>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="card-title">Week {w}</h2>
              {w === data.week && <Badge tone="cyan">This week</Badge>}
            </div>
            <div className="divide-y divide-line">
              {data.classes.filter((c) => c.week === w).map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="w-44 shrink-0 text-sm font-semibold text-title">{formatWhen(c.scheduled_at)}</span>
                  <span className="min-w-0 flex-1 text-sm">{c.title}</span>
                  {c.status === 'ended' ? <Badge tone="good">Held</Badge> : c.status === 'live' ? <Badge tone="cyan">Live</Badge> : (
                    <div className="flex gap-2">
                      <Button size="sm" variant="subtle" onClick={() => setMoving(c)}>Move</Button>
                      <Link to={`/present/${c.id}`}><Button size="sm" variant="ghost">Present</Button></Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {moving && <MoveModal cls={moving} onClose={() => setMoving(null)} onSaved={() => { setMoving(null); void reload(); }} />}
      {ending && (
        <Modal title="End this program?" onClose={() => setEnding(false)}>
          <p className="mb-5 text-muted">Classes that haven't happened yet are removed. Progress, quiz results and sign-offs are kept.</p>
          <EndButton onDone={() => { setEnding(false); void reload(); }} />
        </Modal>
      )}
    </div>
  );
}

function EndButton({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <ErrorNote error={error} />
      <Button variant="danger" className="mt-2 w-full" onClick={async () => {
        try { await api('/api/admin/program/end', { body: {} }); onDone(); } catch (e) { setError((e as Error).message); }
      }}>End the program</Button>
    </>
  );
}

function sydneyParts(iso: string) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return { date, time };
}

function MoveModal({ cls, onClose, onSaved }: { cls: ProgramData['classes'][number]; onClose: () => void; onSaved: () => void }) {
  const start = sydneyParts(cls.scheduled_at);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try { await api(`/api/admin/classes/${cls.id}`, { method: 'PATCH', body: { date, time } }); onSaved(); } catch (err) { setError((err as Error).message); }
  };
  return (
    <Modal title="Move this class" onClose={onClose}>
      <p className="mb-4 text-sm text-muted">{cls.title}</p>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Field label="Time (Sydney)" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </div>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button>Save</Button></div>
      </form>
    </Modal>
  );
}

const DEFAULT_TIMES: Record<string, { weekday: number; time: string }> = {
  field: { weekday: 2, time: '07:00' }, install: { weekday: 3, time: '07:00' }, service: { weekday: 4, time: '07:00' },
  sales: { weekday: 5, time: '07:00' }, all: { weekday: 5, time: '12:00' },
};

function CreateProgram({ defaults, canCreate, onCreated }: { defaults: ProgramData['defaults']; canCreate: boolean; onCreated: () => void }) {
  const [name, setName] = useState(defaults.name);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [times, setTimes] = useState(DEFAULT_TIMES);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setT = (g: string, k: 'weekday' | 'time', v: string) => setTimes((t) => ({ ...t, [g]: { ...t[g], [k]: k === 'weekday' ? Number(v) : v } }));
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await api('/api/admin/program', { body: { name, startDate, groupTimes: times } }); onCreated(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="fade-in max-w-3xl">
      <div className="eyebrow mb-2">8-week program</div>
      <h1 className="headline text-3xl">Set up the program</h1>
      <p className="mt-1 mb-6 text-muted">
        This creates all 23 live classes from the 8-week schedule and gives every tech due dates. You can move single classes afterwards.
      </p>
      {!canCreate && <p className="mb-4 text-sm text-amber">Only an admin can create the program.</p>}
      <Card className="p-6">
        <form onSubmit={create} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Field label="Start date (week 1)" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} hint="Suggested Mon 1 Feb 2027 [to be confirmed]" required />
          </div>
          <div>
            <div className="mb-1 text-sm font-semibold text-title">Weekly class day and time for each group (Sydney time)</div>
            <p className="mb-3 text-xs text-faint">Pick the real days and times. Install + Service has two classes in week 1: the second goes two days after the first.</p>
            <div className="divide-y divide-line rounded-[12px] shadow-card">
              {Object.keys(DEFAULT_TIMES).map((g) => (
                <div key={g} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-48 flex-1 text-sm font-medium text-title">{GROUP_LABELS[g]}</span>
                  <select aria-label={`${GROUP_LABELS[g]} day`} value={times[g].weekday} onChange={(e) => setT(g, 'weekday', e.target.value)}
                    className="rounded-[6px] border border-line bg-card px-3 py-2 text-sm text-title">
                    {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
                  </select>
                  <input aria-label={`${GROUP_LABELS[g]} time`} type="time" value={times[g].time} onChange={(e) => setT(g, 'time', e.target.value)}
                    className="rounded-[6px] border border-line bg-card px-3 py-2 text-sm text-title" />
                </div>
              ))}
            </div>
          </div>
          <ErrorNote error={error} />
          <Button size="lg" disabled={busy || !canCreate}>{busy ? 'Creating…' : 'Create the program and its 23 classes'}</Button>
        </form>
      </Card>
    </div>
  );
}

// ================================================================ phone: this week
interface MyProgram {
  program: { name: string; startDate: string; week: number; weeks: number } | null;
  today?: string;
  modules?: Array<{ id: string; title: string; week: number; due: string; done: boolean; overdue: boolean }>;
  nextClass?: { id: string; title: string; scheduled_at: string; status: string; join_code: string | null } | null;
}

export function ThisWeek() {
  const { data } = useApi<MyProgram>('/api/me/program');
  if (!data?.program) return null;
  const { program: p, modules = [] } = data;
  const thisWeek = modules.filter((m) => m.week === p.week);
  const overdue = modules.filter((m) => m.overdue);
  return (
    <Card className="mb-6 p-5">
      <div className="eyebrow mb-1">{p.week === 0 ? 'Starting soon' : p.week > p.weeks ? 'Program finished' : `Week ${p.week} of ${p.weeks}`}</div>
      <div className="card-title">{p.week === 0 ? `Starts ${fmtDate(p.startDate)}` : 'This week'}</div>
      {data.nextClass && (
        <p className="mt-1 text-sm text-muted">
          Next class: <b className="text-title">{formatWhen(data.nextClass.scheduled_at)}</b>
        </p>
      )}
      {overdue.length > 0 && (
        <div className="mt-3 rounded-[10px] bg-bad/10 px-3 py-2 text-sm text-bad">
          <b>Overdue:</b> {overdue.map((m) => m.title).join(', ')}
        </div>
      )}
      {thisWeek.length > 0 && (
        <ul className="mt-3 space-y-2">
          {thisWeek.map((m) => (
            <li key={m.id}>
              <Link to={`/module/${m.id}`} className="flex items-center gap-3">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${m.done ? 'bg-good text-white' : 'bg-tone/5 text-faint'}`}>{m.done ? '✓' : ''}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-title">{m.title}</span>
                <span className="shrink-0 text-xs text-faint">due {fmtDate(m.due)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ReviewBanner() {
  const { user } = useAuth();
  const { data } = useApi<{ signoffs: Array<{ canReview: boolean }> }>(user?.reviewsSignoffs ? '/api/review/signoffs' : null);
  const n = data?.signoffs.filter((s) => s.canReview).length ?? 0;
  if (!n) return null;
  return (
    <Link to="/review" className="mb-4 flex items-center gap-3 rounded-[12px] bg-soft px-4 py-3.5 shadow-[inset_0_0_0_1px_rgba(0,173,237,.22)]">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{n}</span>
      <span className="flex-1 font-semibold text-title">Sign-off{n > 1 ? 's' : ''} waiting for you</span>
      <span className="text-link">Review ›</span>
    </Link>
  );
}

// ================================================================ module: request sign-offs
export interface MySignoff {
  id: string; item_index: number; status: 'waiting' | 'approved' | 'returned'; job_ref: string | null; tech_note: string | null;
  review_note: string | null; requested_at: string; reviewed_at: string | null; photos: number;
}

export function SignoffSection({ moduleId, items, assessor, signoffs, inMyPath, onChange }:
  { moduleId: string; items: string[]; assessor: string | null; signoffs: MySignoff[]; inMyPath: boolean; onChange: () => void }) {
  const [asking, setAsking] = useState<number | null>(null);
  const by = new Map(signoffs.map((s) => [s.item_index, s]));
  const approved = signoffs.filter((s) => s.status === 'approved').length;
  return (
    <section className="mt-7">
      <h2 className="section-title mb-1">Sign-offs</h2>
      <p className="mb-3 text-sm text-muted">
        On the job · {approved} of {items.length} signed off{assessor && <> · signed off by <Marked text={assessor} compact /></>}
      </p>
      <Card className="divide-y divide-line">
        {items.map((text, i) => {
          const s = by.get(i);
          return (
            <div key={i} className="p-4">
              <div className="flex gap-3">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  s?.status === 'approved' ? 'bg-good text-white' : s?.status === 'waiting' ? 'bg-soft text-link' : s?.status === 'returned' ? 'bg-bad/10 text-bad' : 'bg-tone/5 text-faint'}`}>
                  {s?.status === 'approved' ? '✓' : s?.status === 'waiting' ? '…' : s?.status === 'returned' ? '!' : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="leading-snug text-title"><Marked text={text} /></p>
                  {s?.status === 'waiting' && <p className="mt-1 text-sm text-link">Waiting for sign-off · sent {timeAgo(s.requested_at)}</p>}
                  {s?.status === 'approved' && <p className="mt-1 text-sm text-good">Signed off {timeAgo(s.reviewed_at)}{s.review_note ? `: “${s.review_note}”` : ''}</p>}
                  {s?.status === 'returned' && <p className="mt-1 rounded-[10px] bg-bad/10 px-3 py-2 text-sm text-bad">Sent back: {s.review_note}</p>}
                  {inMyPath && s?.status !== 'approved' && s?.status !== 'waiting' && (
                    <Button size="sm" variant="ghost" className="mt-3" onClick={() => setAsking(i)}>{s ? 'Send again' : 'Request sign-off'}</Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </Card>
      {asking !== null && (
        <RequestModal moduleId={moduleId} index={asking} text={items[asking]}
          onClose={() => setAsking(null)} onSent={() => { setAsking(null); onChange(); }} />
      )}
    </section>
  );
}

// Shrinks a photo on the phone before upload, so each one is a few hundred KB.
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('That file is not a photo the app can read.'));
      i.src = url;
    });
    for (const [max, quality] of [[1600, 0.8], [1280, 0.72], [1024, 0.65], [800, 0.6]] as const) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', quality);
      if (data.length * 0.75 < 650 * 1024) return data;
    }
    throw new Error('That photo is too large.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function RequestModal({ moduleId, index, text, onClose, onSent }:
  { moduleId: string; index: number; text: string; onClose: () => void; onSent: () => void }) {
  const [jobRef, setJobRef] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const add = async (files: FileList | null) => {
    setError(null);
    for (const f of Array.from(files ?? []).slice(0, 3 - photos.length)) {
      try { const d = await shrink(f); setPhotos((p) => [...p, d].slice(0, 3)); } catch (e) { setError((e as Error).message); }
    }
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await api(`/api/modules/${moduleId}/signoffs/${index}`, { body: { jobRef, note, photos } }); onSent(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Request sign-off" onClose={onClose}>
      <p className="mb-4 rounded-[10px] bg-tone/5 px-3 py-2 text-sm text-title"><Marked text={text} /></p>
      <form onSubmit={send} className="space-y-4">
        <Field label="ServiceTitan job number" inputMode="text" placeholder="e.g. 123456" value={jobRef} onChange={(e) => setJobRef(e.target.value)}
          hint="The assessor checks your photos, video and notes on that job." />
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-title">Note (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={600}
            className="w-full rounded-[6px] border border-line bg-card px-4 py-3 text-title placeholder:text-faint focus:border-brand focus:outline-none"
            placeholder="What you did, and who saw it" />
        </label>
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-title">Photos (optional, up to 3)</span>
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative">
                <img src={p} alt={`Photo ${i + 1}`} className="h-20 w-20 rounded-[8px] object-cover shadow-card" />
                <button type="button" aria-label="Remove photo" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))}
                  className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-navy text-xs text-white">✕</button>
              </div>
            ))}
            {photos.length < 3 && (
              <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-[8px] border-[1.5px] border-dashed border-brand text-2xl text-link">
                +<input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </div>
        <ErrorNote error={error} />
        <Button size="lg" className="w-full" disabled={busy}>{busy ? 'Sending…' : 'Send for sign-off'}</Button>
      </form>
    </Modal>
  );
}

// ================================================================ reviewers
interface ReviewItem {
  id: string; user_id: string; module_id: string; moduleTitle: string; item_index: number; item_text: string; status: string;
  job_ref: string | null; tech_note: string | null; requested_at: string; review_note: string | null; reviewed_at: string | null;
  reviewed_by_name: string | null; tech_name: string; tech_role: string; tech_apprentice: boolean; photo_ids: string[];
  canReview: boolean; assessor: string | null;
}

export function ReviewQueue() {
  const [status, setStatus] = useState<'waiting' | 'approved' | 'returned'>('waiting');
  const [onlyMine, setOnlyMine] = useState(true);
  const { data, error, loading, reload } = useApi<{ signoffs: ReviewItem[] }>(`/api/review/signoffs?status=${status}`);
  const [zoom, setZoom] = useState<string | null>(null);
  const items = (data?.signoffs ?? []).filter((s) => status !== 'waiting' || !onlyMine || s.canReview);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['waiting', 'approved', 'returned'] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`rounded-[10px] px-3 py-1.5 text-sm ${status === s ? 'bg-soft font-semibold text-title shadow-[inset_0_0_0_1px_rgba(0,173,237,.22)]' : 'text-muted hover:bg-tone/5'}`}>
            {s === 'waiting' ? 'Waiting' : s === 'approved' ? 'Signed off' : 'Sent back'}
          </button>
        ))}
        {status === 'waiting' && (
          <label className="ml-auto flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="accent-brand" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Only ones routed to me
          </label>
        )}
      </div>
      {loading ? <Loading /> : error ? <ErrorNote error={error.message} /> : !items.length ? (
        <Card className="p-8 text-center text-muted">{status === 'waiting' ? 'Nothing waiting. Nice.' : 'Nothing here yet.'}</Card>
      ) : (
        <div className="space-y-3">
          {items.map((s) => <ReviewCard key={s.id} s={s} onZoom={setZoom} onDone={reload} />)}
        </div>
      )}
      {zoom && (
        <Modal title="Photo" onClose={() => setZoom(null)} wide>
          <img src={zoom} alt="Evidence" className="max-h-[70vh] w-full rounded-[8px] object-contain" />
        </Modal>
      )}
    </div>
  );
}

function ReviewCard({ s, onZoom, onDone }: { s: ReviewItem; onZoom: (src: string) => void; onDone: () => void }) {
  const [mode, setMode] = useState<'idle' | 'return'>('idle');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (action: 'approve' | 'return') => {
    setBusy(true);
    setError(null);
    try { await api(`/api/review/signoffs/${s.id}`, { body: { action, note } }); onDone(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const waitingDays = (Date.now() - new Date(s.requested_at).getTime()) / 86400000;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="card-title">{s.tech_name}{s.tech_apprentice && <span className="ml-1.5 text-xs font-normal text-faint">(apprentice)</span>}</div>
          <div className="text-sm text-muted">{s.moduleTitle}</div>
        </div>
        <Badge tone={waitingDays > 7 && s.status === 'waiting' ? 'bad' : 'muted'}>
          {s.status === 'waiting' ? `sent ${timeAgo(s.requested_at)}` : `${s.status === 'approved' ? 'signed off' : 'sent back'} ${timeAgo(s.reviewed_at)}`}
        </Badge>
      </div>
      <p className="mt-3 rounded-[10px] bg-tone/5 px-3 py-2 font-medium text-title"><Marked text={s.item_text} /></p>
      <div className="mt-3 space-y-1 text-sm">
        {s.job_ref && <div><span className="text-muted">ServiceTitan job:</span> <b className="text-title">{s.job_ref}</b></div>}
        {s.tech_note && <div><span className="text-muted">Note:</span> {s.tech_note}</div>}
        {s.review_note && <div><span className="text-muted">{s.reviewed_by_name ?? 'Reviewer'}:</span> {s.review_note}</div>}
      </div>
      {s.photo_ids.length > 0 && (
        <div className="mt-3 flex gap-2">
          {s.photo_ids.map((pid) => {
            const src = `/api/signoffs/${s.id}/photos/${pid}`;
            return <button key={pid} onClick={() => onZoom(src)}><img src={src} alt="Evidence" className="h-20 w-20 rounded-[8px] object-cover shadow-card" /></button>;
          })}
        </div>
      )}
      {s.status === 'waiting' && (
        s.canReview ? (
          <div className="mt-4">
            {mode === 'return' && (
              <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={600}
                placeholder="What do they need to do before you can sign it off?"
                className="mb-3 w-full rounded-[6px] border border-line bg-card px-3 py-2 text-sm text-title focus:border-brand focus:outline-none" />
            )}
            <ErrorNote error={error} />
            <div className="mt-2 flex flex-wrap gap-2">
              {mode === 'idle' ? (
                <>
                  <Button disabled={busy} onClick={() => act('approve')}>✓ Sign off</Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setMode('return')}>Send back</Button>
                </>
              ) : (
                <>
                  <Button variant="danger" disabled={busy || !note.trim()} onClick={() => act('return')}>Send back with note</Button>
                  <Button variant="subtle" onClick={() => setMode('idle')}>Cancel</Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-faint">Routed to: <Marked text={s.assessor ?? ''} compact /></p>
        )
      )}
    </Card>
  );
}

export function SignoffsAdminPage() {
  return (
    <div className="fade-in max-w-4xl">
      <div className="mb-6">
        <div className="eyebrow mb-2">Field sign-offs</div>
        <h1 className="headline text-3xl">Sign-offs</h1>
        <p className="mt-1 text-muted">Techs request these from real jobs. Each one goes to the people named in the module's "Signed off by" line. Charlotte and William can sign off anything.</p>
      </div>
      <ReviewQueue />
    </div>
  );
}

export function ReviewPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <PhoneShell back="/">
      <div className="eyebrow mb-2">Field sign-offs</div>
      <h1 className="headline mb-5 text-3xl">Review sign-offs</h1>
      <ReviewQueue />
    </PhoneShell>
  );
}
