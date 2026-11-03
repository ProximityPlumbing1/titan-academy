import { useState, type FormEvent } from 'react';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { Badge, Button, Card, ErrorNote, Loading } from '../ui';

interface Row { week: number; avg_ticket: string | null; close_rate: string | null; bundled_pct: string | null; financed_pct: string | null; care_plan_pct: string | null; note: string | null }
interface Board { week: number | null; techs: Array<{ id: string; name: string; rows: Row[] }> }

const FIELDS = [
  { k: 'avg_ticket', label: 'Average ticket', unit: '$' },
  { k: 'close_rate', label: 'Close rate', unit: '%' },
  { k: 'bundled_pct', label: 'Quotes with a bundle', unit: '%' },
  { k: 'financed_pct', label: 'Big jobs financed', unit: '%' },
  { k: 'care_plan_pct', label: 'Care Plan offered', unit: '%' },
] as const;
type Key = (typeof FIELDS)[number]['k'];

const num = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v));
export const fmt = (k: Key, v: number | null) => (v === null ? '—' : k === 'avg_ticket' ? `$${Math.round(v).toLocaleString('en-AU')}` : `${Math.round(v * 10) / 10}%`);
const weekName = (w: number) => (w === 0 ? 'Baseline' : `Week ${w}`);

function Delta({ k, base, now }: { k: Key; base: number | null; now: number | null }) {
  if (base === null || now === null) return null;
  const d = now - base;
  if (Math.abs(d) < 0.05) return <span className="text-xs text-faint">±0</span>;
  const txt = k === 'avg_ticket' ? `${d > 0 ? '+' : '−'}$${Math.abs(Math.round(d)).toLocaleString('en-AU')}` : `${d > 0 ? '+' : '−'}${Math.abs(Math.round(d * 10) / 10)} pts`;
  return <span className={`text-xs font-semibold ${d > 0 ? 'text-good' : 'text-bad'}`}>{txt}</span>;
}

export function ScoreboardPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<Board>('/api/admin/scoreboard');
  const canEdit = !!(user?.isAdmin || user?.isSalesManager);
  if (loading && !data) return <Loading />; // keep the page (and any open form) on screen while it refreshes
  if (!data) return <ErrorNote error={error?.message} />;
  return (
    <div className="fade-in">
      <div className="mb-6">
        <div className="eyebrow mb-2">Advanced Sales</div>
        <h1 className="headline text-3xl">Sales scoreboard</h1>
        <p className="mt-1 max-w-3xl text-muted">
          Each Sales Tech's baseline (their last 90 days before the program) and weekly numbers, entered by Harriet from ServiceTitan.
          Average ticket and close rate are the two numbers that matter: they multiply.
        </p>
      </div>
      {!data.techs.length && <Card className="p-8 text-center text-muted">No Sales Techs yet.</Card>}
      <div className="space-y-5">
        {data.techs.map((t) => <TechCard key={t.id} tech={t} canEdit={canEdit} currentWeek={data.week} onSaved={reload} />)}
      </div>
    </div>
  );
}

function TechCard({ tech, canEdit, currentWeek, onSaved }: { tech: Board['techs'][number]; canEdit: boolean; currentWeek: number | null; onSaved: () => void }) {
  const base = tech.rows.find((r) => r.week === 0);
  const latest = [...tech.rows].filter((r) => r.week > 0).sort((a, b) => b.week - a.week)[0];
  const [editing, setEditing] = useState(false);
  return (
    <section aria-label={tech.name}>
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="card-title flex-1">{tech.name}</h2>
        {!base && <Badge tone="amber">No baseline yet</Badge>}
        {canEdit && <Button size="sm" variant={editing ? 'subtle' : 'ghost'} onClick={() => setEditing(!editing)}>{editing ? 'Close' : 'Enter numbers'}</Button>}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {FIELDS.map((f) => (
          <div key={f.k} className="rounded-[10px] bg-tone/[0.03] px-3 py-2.5">
            <div className="text-xs text-muted">{f.label}</div>
            <div className="text-lg font-extrabold text-title">{fmt(f.k, num(latest?.[f.k] ?? base?.[f.k]))}</div>
            {latest && <Delta k={f.k} base={num(base?.[f.k])} now={num(latest[f.k])} />}
          </div>
        ))}
      </div>
      {tech.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-faint"><th className="py-1.5 pr-3">Week</th>{FIELDS.map((f) => <th key={f.k} className="px-3 py-1.5">{f.label}</th>)}<th className="px-3 py-1.5">Note</th></tr></thead>
            <tbody className="divide-y divide-line">
              {tech.rows.map((r) => (
                <tr key={r.week}>
                  <td className="py-1.5 pr-3 font-semibold text-title">{weekName(r.week)}</td>
                  {FIELDS.map((f) => <td key={f.k} className="px-3 py-1.5">{fmt(f.k, num(r[f.k]))}</td>)}
                  <td className="px-3 py-1.5 text-muted">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <EntryForm tech={tech} defaultWeek={base ? Math.max(1, currentWeek ?? 1) : 0} onSaved={() => { onSaved(); }} />}
    </Card>
    </section>
  );
}

function EntryForm({ tech, defaultWeek, onSaved }: { tech: Board['techs'][number]; defaultWeek: number; onSaved: () => void }) {
  const [week, setWeek] = useState(defaultWeek);
  const existing = tech.rows.find((r) => r.week === week);
  const blank = { avg_ticket: '', close_rate: '', bundled_pct: '', financed_pct: '', care_plan_pct: '', note: '' };
  const [vals, setVals] = useState<Record<string, string>>(existing ? { ...blank, ...Object.fromEntries(Object.entries(existing).map(([k, v]) => [k, v ?? ''])) } : blank);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const pick = (w: number) => {
    setWeek(w);
    const e = tech.rows.find((r) => r.week === w);
    setVals(e ? { ...blank, ...Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v ?? ''])) } : blank);
    setSaved(false);
  };
  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    setError(null);
    try { await api(`/api/admin/scoreboard/${tech.id}/${week}`, { method: 'PUT', body: vals }); setSaved(true); onSaved(); }
    catch (e) { setError((e as Error).message); }
  };
  const input = 'w-full rounded-[6px] border border-line bg-card px-3 py-2 text-sm text-title focus:border-brand focus:outline-none';
  return (
    <form onSubmit={save} className="mt-4 rounded-[12px] bg-soft p-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <label className="block"><span className="mb-1 block text-xs font-semibold text-title">Week</span>
          <select aria-label="Week" value={week} onChange={(e) => pick(Number(e.target.value))} className={input}>
            {Array.from({ length: 9 }, (_, w) => <option key={w} value={w}>{weekName(w)}</option>)}
          </select>
        </label>
        {FIELDS.map((f) => (
          <label key={f.k} className="block"><span className="mb-1 block text-xs font-semibold text-title">{f.label} ({f.unit})</span>
            <input aria-label={f.label} inputMode="decimal" value={vals[f.k]} onChange={(e) => setVals((v) => ({ ...v, [f.k]: e.target.value }))} className={input} />
          </label>
        ))}
        <label className="block"><span className="mb-1 block text-xs font-semibold text-title">Note</span>
          <input aria-label="Note" value={vals.note} onChange={(e) => setVals((v) => ({ ...v, note: e.target.value }))} className={input} />
        </label>
      </div>
      <ErrorNote error={error} />
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm">Save {weekName(week).toLowerCase()}</Button>
        {saved && <span className="text-sm text-good">Saved</span>}
        <span className="text-xs text-faint">Leave every box empty and save to remove a week.</span>
      </div>
    </form>
  );
}

// Phone: a Sales Tech's own two numbers.
export function MyNumbers() {
  const { user } = useAuth();
  const { data } = useApi<{ rows: Row[] }>(user?.tradeRole === 'salestech' ? '/api/me/numbers' : null);
  const rows = data?.rows ?? [];
  if (!rows.length) return null;
  const base = rows.find((r) => r.week === 0);
  const latest = [...rows].filter((r) => r.week > 0).sort((a, b) => b.week - a.week)[0];
  return (
    <Card className="mb-6 p-5">
      <div className="eyebrow mb-1">Your two numbers</div>
      <div className="mb-3 text-sm text-muted">{latest ? `${weekName(latest.week)} vs your baseline` : 'Your baseline'}</div>
      <div className="grid grid-cols-2 gap-3">
        {(['avg_ticket', 'close_rate'] as const).map((k) => (
          <div key={k} className="rounded-[10px] bg-tone/[0.03] px-3 py-2.5">
            <div className="text-xs text-muted">{k === 'avg_ticket' ? 'Average ticket' : 'Close rate'}</div>
            <div className="text-xl font-extrabold text-title">{fmt(k, num((latest ?? base)?.[k]))}</div>
            {latest && <Delta k={k} base={num(base?.[k])} now={num(latest[k])} />}
          </div>
        ))}
      </div>
    </Card>
  );
}
