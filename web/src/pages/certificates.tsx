import { useEffect, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { Badge, Button, Card, ErrorNote, Loading, Logo, Modal, Ring } from '../ui';
import { PhoneShell } from './learner';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const fmtLong = (d: string) => new Date(`${d.slice(0, 10)}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
const ROLE: Record<string, string> = { install: 'Install', service: 'Service', salestech: 'Sales' };

interface Progress {
  modules: { done: number; total: number; missing: string[] };
  signoffs: { approved: number; total: number };
  final: { passed: boolean; best: number | null; used: number; allowed: number };
  roleplay: boolean | null;
  eligible: boolean;
}

// ================================================================ phone: final assessment
interface FinalInfo { open: boolean; role: string | null; length: number; poolSize: number; final: Progress['final']; inProgress: boolean; roleplay: boolean | null }

export function FinalBanner() {
  const { data } = useApi<FinalInfo>('/api/me/final');
  if (!data?.open || !data.role || data.final.passed || data.final.used >= data.final.allowed) return null;
  return (
    <Link to="/final" className="mb-4 block rounded-[20px] bg-gradient-to-br from-[#0085ba] to-[#006e9e] p-5 text-white shadow-glow fade-in">
      <div className="text-xs font-bold uppercase tracking-widest">Week 8</div>
      <div className="mt-1 text-lg font-bold">The final assessment is open</div>
      <div className="mt-3 inline-block rounded-[10px] bg-white px-4 py-2.5 font-bold text-link">{data.inProgress ? 'Carry on →' : 'Start →'}</div>
    </Link>
  );
}

export function FinalPage() {
  const info = useApi<FinalInfo>('/api/me/final');
  const [attempt, setAttempt] = useState<{ attemptId: string; questions: Array<{ q: string; options: string[] }> } | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{ score: number; passed: boolean; right: number; total: number; revise: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); }, [i, result]);
  if (info.loading) return <Loading />;
  if (info.error || !info.data) return <PhoneShell back="/"><ErrorNote error={info.error?.message} /></PhoneShell>;
  const d = info.data;
  const start = async () => {
    setBusy(true);
    setError(null);
    try { const a = await api<typeof attempt>('/api/me/final/start', { body: {} }); setAttempt(a); setAnswers([]); setI(0); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  if (result) {
    return (
      <PhoneShell back="/">
        <div className="mb-6 flex flex-col items-center text-center fade-in">
          <Ring pct={result.score / 100} size={150} color={result.passed ? 'var(--color-good)' : 'var(--color-amber)'}>
            <span className="text-3xl font-extrabold text-title">{result.score}%</span>
          </Ring>
          <h1 className="headline mt-4 text-3xl">{result.passed ? 'You passed the final' : 'Not this time'}</h1>
          <p className="mt-1 text-muted">{result.right} of {result.total} correct. You need 80% to pass.</p>
        </div>
        {!result.passed && result.revise.length > 0 && (
          <Card className="mb-5 p-5">
            <div className="eyebrow mb-2">Revise before your retake</div>
            <ul className="space-y-1.5 text-sm text-title">{result.revise.map((t) => <li key={t}>• {t}</li>)}</ul>
            <p className="mt-3 text-xs text-faint">The retake draws a fresh set of questions.</p>
          </Card>
        )}
        <Link to={result.passed ? '/certificate' : '/'}><Button size="lg" className="w-full">{result.passed ? 'See your certificate progress' : 'Back to home'}</Button></Link>
      </PhoneShell>
    );
  }
  if (!attempt) {
    const left = d.final.allowed - d.final.used;
    return (
      <PhoneShell back="/">
        <div className="eyebrow mb-2">Week 8</div>
        <h1 className="headline text-3xl">Final assessment</h1>
        <p className="mt-2 text-muted">{d.length || 25} scenario questions from your whole program, on your phone. 80% passes. You get {d.final.allowed === 2 ? 'one retake' : `${d.final.allowed - 1} retakes`} with a fresh set of questions.</p>
        <Card className="mt-5 p-5">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span className="text-muted">Status</span><b className="text-title">{d.final.passed ? 'Passed' : d.open ? 'Open' : 'Opens in the week 8 session'}</b></li>
            <li className="flex justify-between"><span className="text-muted">Best score</span><b className="text-title">{d.final.best === null ? '—' : `${d.final.best}%`}</b></li>
            <li className="flex justify-between"><span className="text-muted">Attempts left</span><b className="text-title">{Math.max(0, left)}</b></li>
          </ul>
        </Card>
        {d.role === 'salestech' && (
          <p className="mt-4 text-sm text-muted">Sales Techs also need the live role-play round in the week 8 session: {d.roleplay ? <b className="text-good">passed ✓</b> : 'not yet'}.</p>
        )}
        <ErrorNote error={error} />
        {!d.final.passed && d.open && left > 0 && (
          <Button size="lg" className="mt-6 w-full" disabled={busy} onClick={start}>{d.inProgress ? 'Carry on' : 'Start the final assessment'}</Button>
        )}
        {!d.final.passed && d.open && left <= 0 && <p className="mt-6 text-sm text-muted">You've used your attempts. Talk to William about another one.</p>}
      </PhoneShell>
    );
  }
  const qs = attempt.questions;
  const qq = qs[i];
  const chosen = answers[i];
  const submit = async () => {
    setBusy(true);
    setError(null);
    try { setResult(await api(`/api/me/final/${attempt.attemptId}/submit`, { body: { answers } })); void info.reload(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const answered = answers.filter((a) => a !== undefined).length;
  return (
    <PhoneShell back="/">
      <div className="mb-4 flex items-center gap-[3px]">
        {qs.map((_, n) => <span key={n} className={`h-1.5 flex-1 rounded-full ${answers[n] !== undefined ? 'bg-link' : n === i ? 'bg-brand' : 'bg-tone/10'}`} />)}
      </div>
      <div className="eyebrow mb-2">Final assessment · question {i + 1} of {qs.length}</div>
      <h1 className="headline text-2xl leading-snug">{qq.q}</h1>
      <div className="mt-5 space-y-3">
        {qq.options.map((o, n) => (
          <button key={n} onClick={() => setAnswers((a) => { const c = [...a]; c[i] = n; return c; })}
            className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-4 text-left transition ${chosen === n ? 'border-brand bg-soft' : 'border-line bg-card'}`}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-extrabold ${chosen === n ? 'bg-brand text-white' : 'bg-tone/5 text-title'}`}>{LETTERS[n]}</span>
            <span className="pt-1">{o}</span>
          </button>
        ))}
      </div>
      <ErrorNote error={error} />
      <div className="mt-6 flex gap-3">
        {i > 0 && <Button variant="ghost" onClick={() => setI(i - 1)}>Back</Button>}
        {i < qs.length - 1 ? (
          <Button className="flex-1" size="lg" disabled={chosen === undefined} onClick={() => setI(i + 1)}>Next</Button>
        ) : (
          <Button className="flex-1" size="lg" disabled={answered < qs.length || busy} onClick={submit}>{busy ? 'Marking…' : 'Finish and mark'}</Button>
        )}
      </div>
      {i === qs.length - 1 && answered < qs.length && <p className="mt-3 text-center text-sm text-amber">Answer every question before you finish ({answered} of {qs.length}).</p>}
    </PhoneShell>
  );
}

// ================================================================ phone: certificate
interface MyCert {
  certificate: { number: string; title: string; role_label: string; name: string; completed_on: string; issued_at: string; seen_at: string | null } | null;
  verifyUrl: string | null;
  status: Progress | null;
}

export function CertificateBanner() {
  const { user } = useAuth();
  const { data } = useApi<MyCert>(user?.tradeRole ? '/api/me/certificate' : null);
  if (!data?.certificate) return null;
  return (
    <Link to="/certificate" className="mb-4 flex items-center gap-4 rounded-[20px] bg-card p-4 shadow-[inset_0_0_0_2px_var(--color-gold),var(--shadow-card)] fade-in">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/15 text-2xl">🏅</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold uppercase tracking-widest text-goldtext">{data.certificate.seen_at ? 'Certified' : 'New: you’re certified!'}</span>
        <span className="block truncate font-bold text-title">{data.certificate.title}</span>
      </span>
      <span className="text-gold">›</span>
    </Link>
  );
}

export function CertificatePage() {
  const { data, error, loading } = useApi<MyCert>('/api/me/certificate');
  useEffect(() => {
    if (data?.certificate && !data.certificate.seen_at) void api('/api/me/certificate/seen', { body: {} }).catch(() => {});
  }, [data]);
  if (loading) return <Loading />;
  if (error || !data) return <PhoneShell back="/"><ErrorNote error={error?.message} /></PhoneShell>;
  const c = data.certificate;
  if (!c) {
    const s = data.status;
    const row = (label: string, ok: boolean, detail: string) => (
      <li className="flex items-center gap-3 py-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${ok ? 'bg-good text-white' : 'bg-tone/5 text-muted'}`}>{ok ? '✓' : ''}</span>
        <span className="flex-1 font-medium text-title">{label}</span>
        <span className="text-sm text-muted">{detail}</span>
      </li>
    );
    return (
      <PhoneShell back="/">
        <div className="eyebrow mb-2">Your certificate</div>
        <h1 className="headline text-3xl">Almost there</h1>
        <p className="mt-2 text-muted">Your certificate is issued automatically the moment everything below is ticked.</p>
        {s && (
          <Card className="mt-5 px-5">
            <ul className="divide-y divide-line">
              {row('Modules (quiz 80%+)', s.modules.done === s.modules.total, `${s.modules.done} of ${s.modules.total}`)}
              {row('Field sign-offs', s.signoffs.approved === s.signoffs.total, `${s.signoffs.approved} of ${s.signoffs.total}`)}
              {row('Final assessment', s.final.passed, s.final.passed ? 'passed' : s.final.best !== null ? `best ${s.final.best}%` : 'week 8')}
              {s.roleplay !== null && row('Live role-play round', s.roleplay, s.roleplay ? 'passed' : 'week 8')}
            </ul>
          </Card>
        )}
      </PhoneShell>
    );
  }
  return (
    <PhoneShell back="/">
      <div className="flex flex-col items-center pt-4 text-center">
        <div className="relative">
          <div className="celebrate absolute -inset-8" aria-hidden />
          <Ring pct={1} size={150} stroke={10} color="var(--color-gold)">
            <span className="text-5xl">🏅</span>
          </Ring>
        </div>
        <div className="eyebrow mt-6">Congratulations</div>
        <h1 className="headline mt-2 text-3xl leading-tight">{c.title}</h1>
        <p className="mt-3 text-muted">Awarded to</p>
        <p className="em text-4xl text-title">{c.name}</p>
        <p className="mt-3 text-sm text-faint">{c.role_label} · completed {fmtLong(c.completed_on)}<br />Certificate no. {c.number}</p>
      </div>
      <div className="mt-8 space-y-3">
        <a href={`/api/certificates/${encodeURIComponent(c.number)}/pdf`} className="block"><Button size="lg" variant="gold" className="w-full">Download certificate (PDF)</Button></a>
        {data.verifyUrl && <a href={data.verifyUrl} className="block"><Button size="lg" variant="ghost" className="w-full">Open the verification page</Button></a>}
      </div>
      <p className="mt-6 text-center text-xs text-faint">Anyone can scan the QR code on the certificate to check it’s genuine.</p>
    </PhoneShell>
  );
}

// ================================================================ public: verify
export function VerifyPage() {
  const { number = '' } = useParams();
  const { data, loading } = useApi<{ found: boolean; valid?: boolean; name?: string; title?: string; role?: string; completedOn?: string; number?: string }>(`/api/verify/${encodeURIComponent(number)}`);
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: 'radial-gradient(900px 520px at 50% -12%, rgba(0,173,237,.16), transparent 62%), linear-gradient(180deg, #fafbfc 0%, #ecf9fe 70%, #c7edfb 100%)' }}>
      <div className="w-full max-w-md fade-in">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="rounded-[20px] bg-card p-7 text-center shadow-panel">
          {loading ? <Loading /> : !data?.found ? (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-bad/10 text-2xl text-bad">✕</div>
              <h1 className="headline text-2xl">Certificate not found</h1>
              <p className="mt-2 text-muted">No Titan Academy certificate has the number <b className="text-title">{number}</b>.</p>
            </>
          ) : (
            <>
              <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl ${data.valid ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'}`}>{data.valid ? '✓' : '✕'}</div>
              <div className={`eyebrow mb-2 ${data.valid ? '!text-good' : '!text-bad'}`}>{data.valid ? 'Valid certificate' : 'Not valid: revoked'}</div>
              <h1 className="headline text-2xl">{data.title}</h1>
              <p className="mt-4 text-muted">Awarded to</p>
              <p className="em text-3xl text-title">{data.name}</p>
              <p className="mt-4 text-sm text-faint">{data.role} · completed {data.completedOn ? fmtLong(data.completedOn) : ''}<br />Certificate no. {data.number}</p>
            </>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-faint">Issued by Proximity Plumbing through Titan Academy, its internal training program.</p>
      </div>
    </div>
  );
}

// ================================================================ admin: certificates
interface AdminCerts {
  finalOpen: boolean; signatureUpdatedAt: string | null; pools: Record<string, number>;
  techs: Array<{ id: string; name: string; tradeRole: string; isApprentice: boolean; status: string; progress: Progress; certificate: { number: string; title: string; completed_on: string; issued_by: string | null } | null }>;
  revoked: Array<{ number: string; name: string; title: string; revoked_at: string; revoke_reason: string }>;
}

export function CertificatesAdminPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<AdminCerts>('/api/admin/certificates');
  const [err, setErr] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<{ number: string; name: string } | null>(null);
  const [sigKey, setSigKey] = useState(0);
  if (loading && !data) return <Loading />; // keep the screen (and any open window) up while it refreshes
  if (!data) return <ErrorNote error={error?.message} />;
  const run = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); await reload(); setSigKey((k) => k + 1); } catch (e) { setErr((e as Error).message); } };
  const uploadSig = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => void run(() => api('/api/admin/signature', { body: { image: r.result } }));
    r.readAsDataURL(f);
  };
  const certified = data.techs.filter((t) => t.certificate).length;
  const ready = data.techs.filter((t) => !t.certificate && t.progress.eligible).length;
  return (
    <div className="fade-in">
      <div className="mb-6">
        <div className="eyebrow mb-2">Week 8</div>
        <h1 className="headline text-3xl">Final assessment & certificates</h1>
        <p className="mt-1 text-muted">Certificates are issued automatically the moment a tech finishes everything. {certified} certified so far.</p>
      </div>
      <ErrorNote error={err} />
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="card-title">Final assessment</h2>
              <p className="text-sm text-muted">{data.finalOpen ? 'Open: techs can sit it on their phones now.' : 'Closed. Open it in the week 8 session.'}</p>
            </div>
            <Badge tone={data.finalOpen ? 'good' : 'muted'}>{data.finalOpen ? 'Open' : 'Closed'}</Badge>
          </div>
          <p className="mt-3 text-xs text-faint">Question pools (draft): Install {data.pools.install} · Service {data.pools.service} · Sales {data.pools.salestech}. Each tech gets 25, 80% passes, one retake.</p>
          {user?.isAdmin && (
            <Button className="mt-4" variant={data.finalOpen ? 'ghost' : 'primary'} onClick={() => run(() => api('/api/admin/final/open', { body: { open: !data.finalOpen } }))}>
              {data.finalOpen ? 'Close the final assessment' : 'Open the final assessment'}
            </Button>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="card-title">William’s signature</h2>
          <p className="text-sm text-muted">Printed on every certificate. Upload a PNG with a transparent background for the best result.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {data.signatureUpdatedAt
              ? <img key={sigKey} src={`/api/admin/signature?v=${sigKey}`} alt="Signature" className="h-14 max-w-[200px] rounded-[6px] bg-white object-contain p-1 shadow-card" />
              : <span className="text-sm text-amber">Not uploaded: certificates show “William” in script until you do.</span>}
            {user?.isAdmin && (
              <label className="cursor-pointer"><span className="inline-flex min-h-[36px] items-center rounded-[10px] bg-tone/5 px-3 text-sm font-bold text-title hover:bg-tone/10">Upload signature</span>
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={uploadSig} /></label>
            )}
            <a href="/api/admin/certificates/sample.pdf" target="_blank" rel="noreferrer" className="text-sm font-semibold text-link">Preview a sample certificate</a>
          </div>
        </Card>
      </div>
      {ready > 0 && <p className="mb-3 text-sm text-link">{ready} ready to issue: they'll be issued on their next activity, or press Issue now.</p>}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-faint">
              <th className="p-3">Tech</th><th className="p-3">Modules</th><th className="p-3">Sign-offs</th><th className="p-3">Final</th><th className="p-3">Role-play</th><th className="p-3">Certificate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.techs.map((t) => {
              const p = t.progress;
              return (
                <tr key={t.id}>
                  <td className="p-3"><div className="font-semibold text-title">{t.name}</div><div className="text-xs text-faint">{ROLE[t.tradeRole]}{t.isApprentice ? ' · apprentice' : ''}</div></td>
                  <td className={`p-3 ${p.modules.done === p.modules.total ? 'text-good' : ''}`}>{p.modules.done}/{p.modules.total}</td>
                  <td className={`p-3 ${p.signoffs.approved === p.signoffs.total ? 'text-good' : ''}`}>{p.signoffs.approved}/{p.signoffs.total}</td>
                  <td className="p-3">
                    {p.final.passed ? <span className="text-good">Passed {p.final.best}%</span>
                      : p.final.used ? <span>{p.final.best}% · {p.final.used}/{p.final.allowed} used</span> : <span className="text-faint">Not sat</span>}
                    {!p.final.passed && p.final.used >= p.final.allowed && user?.isAdmin && (
                      <button className="ml-2 text-xs font-semibold text-link" onClick={() => run(() => api(`/api/admin/final/${t.id}/extra`, { body: {} }))}>+1 attempt</button>
                    )}
                  </td>
                  <td className="p-3">
                    {p.roleplay === null ? <span className="text-faint">—</span> : (
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 accent-brand" checked={p.roleplay}
                          onChange={(e) => run(() => api(`/api/admin/roleplay/${t.id}`, { body: { passed: e.target.checked } }))} />
                        {p.roleplay ? 'Passed' : 'Not yet'}
                      </label>
                    )}
                  </td>
                  <td className="p-3">
                    {t.certificate ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="gold">{t.certificate.number}</Badge>
                        <a className="text-xs font-semibold text-link" href={`/api/certificates/${encodeURIComponent(t.certificate.number)}/pdf`}>PDF</a>
                        {user?.isAdmin && <button className="text-xs font-semibold text-bad" onClick={() => setRevoking({ number: t.certificate!.number, name: t.name })}>Revoke</button>}
                      </div>
                    ) : p.eligible ? (
                      user?.isAdmin ? <Button size="sm" variant="gold" onClick={() => run(() => api(`/api/admin/certificates/${t.id}/issue`, { body: {} }))}>Issue now</Button> : <Badge tone="good">Ready</Badge>
                    ) : <span className="text-faint">In progress</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      {data.revoked.length > 0 && (
        <Card className="mt-6 p-5">
          <h2 className="card-title mb-2">Revoked</h2>
          <ul className="space-y-1 text-sm">{data.revoked.map((r) => <li key={r.number}><b className="text-title">{r.name}</b> · {r.number} · {r.revoke_reason}</li>)}</ul>
        </Card>
      )}
      {revoking && <RevokeModal cert={revoking} onClose={() => setRevoking(null)} onDone={() => { setRevoking(null); void reload(); }} />}
    </div>
  );
}

function RevokeModal({ cert, onClose, onDone }: { cert: { number: string; name: string }; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`Revoke ${cert.name}’s certificate?`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">The verification page will show it as not valid. To reissue (for example once an apprentice is licensed), update their details, then press Issue now.</p>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason, e.g. Reissuing as full certification"
        className="mb-3 w-full rounded-[6px] border border-line bg-card px-3 py-2 text-sm text-title focus:border-brand focus:outline-none" />
      <ErrorNote error={error} />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" disabled={!reason.trim()} onClick={async () => {
          try { await api(`/api/admin/certificates/${encodeURIComponent(cert.number)}/revoke`, { body: { reason } }); onDone(); } catch (e) { setError((e as Error).message); }
        }}>Revoke</Button>
      </div>
    </Modal>
  );
}
