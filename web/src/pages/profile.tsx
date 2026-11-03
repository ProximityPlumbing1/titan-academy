import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, timeAgo, useApi } from '../api';
import type { User } from '../auth';
import { Badge, Button, Card, ErrorNote, Field, Loading, Marked, Ring } from '../ui';
import { PhoneShell } from './learner';

interface Profile {
  user: User;
  paths: Array<{ id: string; name: string; modules: Array<{
    id: string; title: string; complete: boolean; lessonsRead: number; lessons: number; best: number | null; attempts: number;
    due: string | null; signoffs: { approved: number; total: number };
  }> }>;
  status: { modules: { done: number; total: number }; signoffs: { approved: number; total: number }; final: { passed: boolean; best: number | null; used: number; allowed: number }; roleplay: boolean | null } | null;
  finals: Array<{ score: number; passed: boolean; submitted_at: string }>;
  certificate: { number: string; title: string; completed_on: string } | null;
  signoffs: Array<{ module_id: string; moduleTitle: string; item_text: string; status: string; job_ref: string | null; review_note: string | null; requested_at: string; reviewed_at: string | null; reviewer: string | null }>;
}

const fmt = (d: string) => new Date(`${d.slice(0, 10)}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

export function ProfilePage() {
  const { data, error, loading } = useApi<Profile>('/api/me/profile');
  if (loading) return <Loading />;
  if (error || !data) return <PhoneShell back="/"><ErrorNote error={error?.message} /></PhoneShell>;
  const { user, status: s } = data;
  const pct = s && s.modules.total ? s.modules.done / s.modules.total : 0;
  return (
    <PhoneShell back="/">
      <div className="mb-6 flex items-center gap-5">
        <Ring pct={pct} size={92}><span className="text-xl font-extrabold text-title">{Math.round(pct * 100)}%</span></Ring>
        <div className="min-w-0">
          <div className="eyebrow mb-1">Your profile</div>
          <h1 className="headline truncate text-2xl">{user.name}</h1>
          <p className="text-sm text-muted">{user.position}{user.email ? ` · ${user.email}` : ''}</p>
        </div>
      </div>

      {s && (
        <Card className="mb-6 p-5">
          <div className="card-title mb-3">Certificate</div>
          {data.certificate ? (
            <Link to="/certificate" className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>🏅</span>
              <span className="flex-1"><b className="block text-title">{data.certificate.title}</b><span className="text-sm text-muted">Completed {fmt(data.certificate.completed_on)} · {data.certificate.number}</span></span>
              <span className="text-goldtext">›</span>
            </Link>
          ) : (
            <ul className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Modules" value={`${s.modules.done} of ${s.modules.total}`} ok={s.modules.done === s.modules.total} />
              <Stat label="Sign-offs" value={`${s.signoffs.approved} of ${s.signoffs.total}`} ok={s.signoffs.approved === s.signoffs.total} />
              <Stat label="Final assessment" value={s.final.passed ? 'Passed' : s.final.best !== null ? `Best ${s.final.best}%` : 'Week 8'} ok={s.final.passed} />
              {s.roleplay !== null && <Stat label="Role-play round" value={s.roleplay ? 'Passed' : 'Week 8'} ok={s.roleplay} />}
            </ul>
          )}
        </Card>
      )}

      {data.paths.map((p) => (
        <section key={p.id} className="mb-6">
          <h2 className="section-title mb-3">{p.name}</h2>
          <Card className="divide-y divide-line">
            {p.modules.map((m) => (
              <Link key={m.id} to={`/module/${m.id}`} className="block px-4 py-3 hover:bg-tone/[0.03]">
                <div className="flex items-center gap-3">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${m.complete ? 'bg-good text-white' : 'bg-tone/5 text-muted'}`}>{m.complete ? '✓' : ''}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-title">{m.title}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 pl-9 text-xs text-muted">
                  <span>Lessons {m.lessonsRead}/{m.lessons}</span>
                  <span>Quiz {m.best === null ? 'not taken' : `best ${m.best}%`}</span>
                  {m.signoffs.total > 0 && <span>Sign-offs {m.signoffs.approved}/{m.signoffs.total}</span>}
                  {m.due && !m.complete && <span>Due {fmt(m.due)}</span>}
                </div>
              </Link>
            ))}
          </Card>
        </section>
      ))}

      {data.signoffs.length > 0 && (
        <section className="mb-6">
          <h2 className="section-title mb-3">Sign-off history</h2>
          <Card className="divide-y divide-line">
            {data.signoffs.map((x, i) => (
              <div key={i} className="px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium text-title"><Marked text={x.item_text} compact /></span>
                  <Badge tone={x.status === 'approved' ? 'good' : x.status === 'returned' ? 'bad' : 'cyan'}>
                    {x.status === 'approved' ? 'Signed off' : x.status === 'returned' ? 'Sent back' : 'Waiting'}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {x.moduleTitle}{x.job_ref ? ` · job ${x.job_ref}` : ''} · {x.reviewed_at ? `${x.reviewer ?? 'Reviewed'} ${timeAgo(x.reviewed_at)}` : `sent ${timeAgo(x.requested_at)}`}
                </div>
                {x.review_note && <div className="mt-1 text-xs text-body">“{x.review_note}”</div>}
              </div>
            ))}
          </Card>
        </section>
      )}

      {data.finals.length > 0 && (
        <section className="mb-6">
          <h2 className="section-title mb-3">Final assessment</h2>
          <Card className="divide-y divide-line">
            {data.finals.map((f, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-title">Attempt {i + 1} · {fmt(f.submitted_at)}</span>
                <Badge tone={f.passed ? 'good' : 'amber'}>{f.score}%{f.passed ? ' · passed' : ''}</Badge>
              </div>
            ))}
          </Card>
        </section>
      )}

      <PasswordForm />
    </PhoneShell>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <li className="rounded-[10px] bg-tone/[0.03] px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className={`font-bold ${ok ? 'text-good' : 'text-title'}`}>{ok ? '✓ ' : ''}{value}</div>
    </li>
  );
}

function PasswordForm() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await api('/api/auth/password', { body: { current, next } }); setDone(true); setCurrent(''); setNext(''); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <section className="mb-6">
      <h2 className="section-title mb-3">Password</h2>
      <Card className="p-5">
        {done ? <p className="text-good">Password changed. Any other phones or computers you were signed in on have been signed out.</p>
          : !open ? <Button variant="ghost" onClick={() => setOpen(true)}>Change my password</Button> : (
          <form onSubmit={save} className="space-y-4">
            <Field label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            <Field label="New password" type="password" autoComplete="new-password" hint="At least 8 characters." value={next} onChange={(e) => setNext(e.target.value)} required />
            <ErrorNote error={error} />
            <div className="flex gap-2"><Button disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</Button><Button type="button" variant="subtle" onClick={() => setOpen(false)}>Cancel</Button></div>
          </form>
        )}
      </Card>
    </section>
  );
}
