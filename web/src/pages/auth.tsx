import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button, ErrorNote, Field, Loading, Logo, firstName } from '../ui';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: 'radial-gradient(900px 500px at 50% -10%, rgba(2,101,220,.18), transparent 60%), #0e1320' }}>
      <div className="w-full max-w-sm fade-in">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="rounded-3xl border border-line bg-navy p-6 shadow-2xl">{children}</div>
      </div>
    </div>
  );
}

function landingFor(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export function LoginPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { refresh, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  useEffect(() => {
    api<{ available: boolean }>('/api/setup').then((r) => setSetup(r.available)).catch(() => {});
  }, []);
  useEffect(() => {
    if (user) nav(landingFor(params.get('next')), { replace: true });
  }, [user, nav, params]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { body: { email, password } });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <h1 className="headline mb-1 text-2xl">Sign in</h1>
      <p className="mb-6 text-sm text-muted">Use the email and password you set up from your invite link.</p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <ErrorNote error={error} />
        <Button className="w-full" size="lg" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Forgotten your password, or no invite yet? Ask the office for a new link.
      </p>
      {setup && (
        <p className="mt-4 text-center text-sm">
          <Link to="/setup" className="text-cyan underline">First-time admin setup</Link>
        </p>
      )}
    </Shell>
  );
}

export function SetupPage() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ available: boolean }>('/api/setup').then((r) => setAvailable(r.available)).catch(() => setAvailable(false));
  }, []);
  if (available === null) return <Loading />;
  if (!available)
    return (
      <Shell>
        <h1 className="headline mb-2 text-2xl">Setup is complete</h1>
        <p className="mb-6 text-muted">An admin account already exists.</p>
        <Link to="/login"><Button className="w-full">Go to sign in</Button></Link>
      </Shell>
    );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/setup', { body: { code, email, password } });
      await refresh();
      nav('/admin', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <h1 className="headline mb-1 text-2xl">First-time admin setup</h1>
      <p className="mb-6 text-sm text-muted">Sets the owner's admin login. You need the setup code. This page switches off once it's done.</p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Setup code" value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="off" />
        <Field label="Your email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label="Choose a password" type="password" autoComplete="new-password" minLength={10} hint="At least 10 characters." value={password} onChange={(e) => setPassword(e.target.value)} required />
        <ErrorNote error={error} />
        <Button className="w-full" size="lg" disabled={busy}>{busy ? 'Setting up…' : 'Create admin login'}</Button>
      </form>
    </Shell>
  );
}

export function LinkPage({ kind }: { kind: 'invite' | 'reset' }) {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [info, setInfo] = useState<{ name: string; email: string | null; needsEmail: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/api/auth/link/${token}`).then(setInfo).catch((e) => setLoadError(e.message));
  }, [token]);
  if (loadError)
    return (
      <Shell>
        <h1 className="headline mb-2 text-2xl">Link not valid</h1>
        <p className="text-muted">{loadError}</p>
      </Shell>
    );
  if (!info) return <Loading />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await api(`/api/auth/link/${token}`, { body: { password, email: info.needsEmail ? email : undefined } });
      await refresh();
      nav('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <h1 className="headline mb-1 text-2xl">{kind === 'invite' ? `Welcome, ${firstName(info.name)}` : 'Reset your password'}</h1>
      <p className="mb-6 text-sm text-muted">
        {kind === 'invite' ? 'Set up your Titan Academy login. You stay signed in on this phone.' : `New password for ${info.email}.`}
      </p>
      <form onSubmit={submit} className="space-y-4">
        {info.needsEmail ? (
          <Field label="Your email" type="email" inputMode="email" autoComplete="email" hint="You'll use this to sign in." value={email} onChange={(e) => setEmail(e.target.value)} required />
        ) : (
          kind === 'invite' && <p className="text-sm">Signing in as <b>{info.email}</b></p>
        )}
        <Field label="Choose a password" type="password" autoComplete="new-password" minLength={8} hint="At least 8 characters." value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Field label="Type it again" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <ErrorNote error={error} />
        <Button className="w-full" size="lg" disabled={busy}>{busy ? 'Saving…' : kind === 'invite' ? 'Set up my login' : 'Save new password'}</Button>
      </form>
    </Shell>
  );
}
