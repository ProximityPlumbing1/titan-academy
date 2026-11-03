import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import type { Lesson, Slide } from '../../../shared/types';
import { api, formatWhen, timeAgo, useApi } from '../api';
import { canPresent, useAuth, type User } from '../auth';
import { Stage, TvSlide } from '../slides';
import { LessonBlocks } from './learner';
import { Badge, Button, Card, ErrorNote, Field, Loading, Logo, Marked, Modal, Qr } from '../ui';

const ROLE_NAMES: Record<string, string> = { install: 'Install', service: 'Service', salestech: 'Sales' };

export function AdminLayout() {
  const { user, logout } = useAuth();
  const item = (to: string, label: string) => (
    <NavLink to={to} end={to === '/admin'}
      className={({ isActive }) => `block rounded-[10px] px-3 py-2.5 text-sm ${isActive ? 'bg-soft font-bold text-title shadow-[inset_0_0_0_1px_rgba(0,173,237,.22)]' : 'font-medium text-muted hover:bg-tone/5 hover:text-title'}`}>
      {label}
    </NavLink>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-card p-4 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:p-5">
        <div className="flex items-center justify-between lg:block">
          <Logo small />
          <div className="mt-0 flex gap-1 lg:hidden">
            <Link to="/" className="rounded-lg px-2 py-1 text-sm text-muted">Learner view</Link>
          </div>
        </div>
        <nav className="mt-4 flex flex-wrap gap-1 lg:mt-8 lg:block lg:space-y-1">
          {item('/admin', 'Dashboard')}
          {item('/admin/users', 'People & logins')}
          {item('/admin/program', '8-week program')}
          {item('/admin/classes', 'Classes')}
          {item('/admin/signoffs', 'Sign-offs')}
          {item('/admin/certificates', 'Final & certificates')}
          {item('/admin/content', 'Content')}
          {item('/admin/needs-answers', 'Needs answers')}
        </nav>
        <div className="mt-8 hidden lg:block">
          <div className="px-3 text-[11px] font-semibold uppercase tracking-widest text-faint">Coming next</div>
          <div className="mt-2 space-y-1 px-3 text-sm text-faint">
            <div>Weekly digest email</div><div>Email invites</div>
          </div>
        </div>
        <div className="mt-8 hidden border-t border-line pt-4 text-sm lg:absolute lg:bottom-5 lg:left-5 lg:right-5 lg:block">
          <div className="font-semibold">{user?.name}</div>
          <div className="text-xs text-faint">{user?.position}</div>
          <div className="mt-3 flex gap-3">
            <Link to="/" className="text-muted hover:text-title">Learner view</Link>
            <button onClick={logout} className="text-muted hover:text-title">Sign out</button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 p-5 lg:p-8"><Outlet /></main>
    </div>
  );
}

function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="headline text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-muted">{sub}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- dashboard
interface Dash {
  techs: Array<{
    id: string; name: string; tradeRole: string; status: string; isApprentice: boolean; lastSeenAt: string | null; modules: Record<string, string>;
    done: number; total: number; flags: string[]; overdue: string[]; signoffs: { approved: number; waiting: number; total: number };
  }>;
  program: { name: string; startDate: string; week: number; weeks: number } | null;
  signoffsWaiting: number;
  columns: Record<string, Array<{ id: string; title: string }>>;
  classes: Array<{ id: string; title: string; group_id: string; status: string; scheduled_at: string | null; join_code: string | null }>;
}

export function DashboardPage() {
  const { data, error, loading } = useApi<Dash>('/api/admin/dashboard');
  if (loading) return <Loading />;
  if (error || !data) return <ErrorNote error={error?.message} />;
  const active = data.techs.filter((t) => t.status === 'active').length;
  const avg = data.techs.length ? Math.round((data.techs.reduce((s, t) => s + t.done / Math.max(1, t.total), 0) / data.techs.length) * 100) : 0;
  const attention = data.techs.filter((t) => t.flags.length);
  return (
    <div className="fade-in">
      <PageHead title="Dashboard" sub={data.program
        ? `${data.program.name} · ${data.program.week === 0 ? `starts ${new Date(`${data.program.startDate}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}` : data.program.week > data.program.weeks ? 'program finished' : `week ${data.program.week} of ${data.program.weeks}`}`
        : "Every tech's progress, at a glance. No 8-week program yet."}>
        {!data.program && <Link to="/admin/program"><Button>Set up the 8-week program</Button></Link>}
      </PageHead>
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Field techs" value={data.techs.length} />
        <Stat label="Signed up" value={`${active} / ${data.techs.length}`} tone={active === data.techs.length ? 'good' : 'amber'} />
        <Stat label="Average completion" value={`${avg}%`} />
        <Stat label="Sign-offs waiting" value={<Link to="/admin/signoffs">{data.signoffsWaiting}</Link>} tone="cyan" />
      </div>
      {data.classes.length > 0 && (
        <Card className="mb-6 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="card-title">Live and upcoming classes</h2>
            <Link to="/admin/classes" className="text-sm text-link">All classes</Link>
          </div>
          <div className="divide-y divide-line">
            {data.classes.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2.5">
                {c.status === 'live' ? <Badge tone="cyan">Live · {c.join_code}</Badge> : <Badge>{formatWhen(c.scheduled_at)}</Badge>}
                <span className="flex-1 font-medium">{c.title}</span>
                <Link to={`/present/${c.id}`}><Button size="sm" variant={c.status === 'live' ? 'primary' : 'ghost'}>Present</Button></Link>
              </div>
            ))}
          </div>
        </Card>
      )}
      {attention.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="mb-3 card-title">Needs attention ({attention.length})</h2>
          <div className="flex flex-wrap gap-2">
            {attention.map((t) => (
              <span key={t.id} className="rounded-xl bg-tone/5 px-3 py-1.5 text-sm">
                <b>{t.name}</b> <span className="text-muted">· {t.flags.join(' · ')}</span>
              </span>
            ))}
          </div>
        </Card>
      )}
      {(['install', 'service', 'salestech'] as const).map((role) => (
        <ProgressGrid key={role} title={`${ROLE_NAMES[role]} Techs`} columns={data.columns[role]} techs={data.techs.filter((t) => t.tradeRole === role)} />
      ))}
      <div className="mt-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-good" /> Done</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-amber" /> Started</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-tone/10" /> Not started</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-tone/10 ring-2 ring-bad ring-offset-1" /> Overdue</span>
        <span>Sign-offs: approved / total, <span className="text-link">+waiting</span></span>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'amber' | 'cyan' }) {
  const c = tone === 'good' ? 'text-good' : tone === 'amber' ? 'text-amber' : tone === 'cyan' ? 'text-link' : 'text-title';
  return (
    <Card className="p-5">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-1 text-3xl font-extrabold tracking-[-0.02em] ${c}`}>{value}</div>
    </Card>
  );
}

function ProgressGrid({ title, columns, techs }: { title: string; columns: Array<{ id: string; title: string }>; techs: Dash['techs'] }) {
  return (
    <Card className="mb-6 overflow-x-auto p-5">
      <h2 className="mb-3 card-title">{title} <span className="text-muted">({techs.length})</span></h2>
      <table className="w-full border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 bg-card pr-4 text-left font-medium text-muted">Name</th>
            {columns.map((c) => <th key={c.id} title={c.title} className="px-0.5 text-center text-[11px] font-medium uppercase text-faint">{c.id}</th>)}
            <th className="pl-3 text-right font-medium text-muted">Done</th>
            <th className="pl-3 text-right font-medium text-muted">Sign-offs</th>
            <th className="pl-3 text-right font-medium text-muted">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {techs.map((t) => (
            <tr key={t.id}>
              <td className="sticky left-0 whitespace-nowrap bg-card pr-4">
                {t.name}{t.isApprentice && <span className="ml-1.5 text-xs text-faint">(apprentice)</span>}
                {t.status === 'invited' && <span className="ml-2"><Badge tone="amber">not signed up</Badge></span>}
              </td>
              {columns.map((c) => {
                const s = t.modules[c.id];
                return (
                  <td key={c.id} className="px-0.5 text-center">
                    <span title={`${c.id} · ${c.title}${t.overdue.includes(c.id) ? ' · overdue' : ''}`}
                      className={`inline-block h-5 w-5 rounded ${s === 'done' ? 'bg-good' : s === 'started' ? 'bg-amber' : 'bg-tone/10'} ${t.overdue.includes(c.id) ? 'ring-2 ring-bad ring-offset-1' : ''}`} />
                  </td>
                );
              })}
              <td className="whitespace-nowrap pl-3 text-right">{t.done}/{t.total}</td>
              <td className="whitespace-nowrap pl-3 text-right">{t.signoffs.approved}/{t.signoffs.total}{t.signoffs.waiting > 0 && <span className="ml-1 text-link">+{t.signoffs.waiting}</span>}</td>
              <td className="whitespace-nowrap pl-3 text-right text-muted">{timeAgo(t.lastSeenAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ---------------------------------------------------------------- users
export function UsersPage() {
  const { user: me } = useAuth();
  const { data, error, loading, reload } = useApi<{ users: User[] }>('/api/admin/users');
  const [filter, setFilter] = useState<'all' | 'techs' | 'office'>('all');
  const [search, setSearch] = useState('');
  const [link, setLink] = useState<{ user: User; url: string; kind: string; expiresAt: string } | null>(null);
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const list = useMemo(() => (data?.users ?? []).filter((u) =>
    (filter === 'all' || (filter === 'techs' ? !!u.tradeRole : !u.tradeRole)) &&
    (!search || `${u.name} ${u.email ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [data, filter, search]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorNote error={error?.message} />;
  const admin = !!me?.isAdmin;
  const makeLink = async (u: User) => {
    setActionError(null);
    try {
      const r = await api<{ url: string; kind: string; expiresAt: string }>(`/api/admin/users/${u.id}/link`, { body: {} });
      setLink({ user: u, ...r });
    } catch (e) {
      setActionError((e as Error).message);
    }
  };
  const setDisabled = async (u: User, disabled: boolean) => {
    setActionError(null);
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { disabled } });
      void reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };
  return (
    <div className="fade-in">
      <PageHead title="People & logins" sub="Give each person their own login: send the invite link by SMS or WhatsApp, or let them scan the QR code.">
        {admin && <Button onClick={() => setEditing('new')}>+ Add person</Button>}
      </PageHead>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['all', 'techs', 'office'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-xl px-3 py-1.5 text-sm ${filter === f ? 'bg-soft font-semibold text-title shadow-[inset_0_0_0_1px_rgba(0,173,237,.22)]' : 'text-muted hover:bg-tone/5'}`}>
            {f === 'all' ? 'Everyone' : f === 'techs' ? 'Field techs' : 'Office'}
          </button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
          className="ml-auto w-56 rounded-[6px] border border-line bg-card px-3 py-1.5 text-sm text-title focus:border-brand focus:outline-none" />
      </div>
      <ErrorNote error={actionError} />
      <Card className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-faint">
            <tr><th className="p-3">Name</th><th className="p-3">Role</th><th className="p-3">Email</th><th className="p-3">Status</th><th className="p-3">Last seen</th>{admin && <th className="p-3 text-right">Actions</th>}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((u) => (
              <tr key={u.id} className="hover:bg-tone/[0.02]">
                <td className="p-3">
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-faint">{u.position}</div>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {u.tradeRole && <Badge tone="cyan">{ROLE_NAMES[u.tradeRole]}</Badge>}
                    {u.isAdmin && <Badge tone="gold">Admin</Badge>}
                    {u.isTrainer && <Badge>Trainer</Badge>}
                    {u.isLeadTech && <Badge tone="good">Lead tech</Badge>}
                    {u.isInstallManager && <Badge tone="good">Install Manager</Badge>}
                    {u.isSalesManager && <Badge tone="good">Sales Manager</Badge>}
                    {u.isDispatch && <Badge tone="good">Dispatch</Badge>}
                    {u.signoffAll && <Badge tone="good">Signs off anything</Badge>}
                    {u.isApprentice && <Badge>Apprentice</Badge>}
                  </div>
                </td>
                <td className="p-3 text-muted">{u.email ?? <span className="text-faint">—</span>}</td>
                <td className="p-3">
                  {u.status === 'active' ? <Badge tone="good">Active</Badge> : u.status === 'invited' ? <Badge tone="amber">Not signed up</Badge> : <Badge tone="bad">Disabled</Badge>}
                </td>
                <td className="p-3 text-muted">{timeAgo(u.lastSeenAt)}</td>
                {admin && (
                  <td className="whitespace-nowrap p-3 text-right">
                    {u.status !== 'disabled' && (
                      <Button size="sm" variant={u.hasPassword ? 'subtle' : 'primary'} onClick={() => makeLink(u)}>
                        {u.hasPassword ? 'Reset link' : 'Invite link'}
                      </Button>
                    )}
                    <Button size="sm" variant="subtle" className="ml-2" onClick={() => setEditing(u)}>Edit</Button>
                    {u.id !== me?.id && (
                      <Button size="sm" variant="subtle" className="ml-2" onClick={() => setDisabled(u, u.status !== 'disabled')}>
                        {u.status === 'disabled' ? 'Enable' : 'Disable'}
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {link && <LinkModal link={link} onClose={() => { setLink(null); void reload(); }} />}
      {editing && <UserModal user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
    </div>
  );
}

function LinkModal({ link, onClose }: { link: { user: User; url: string; kind: string; expiresAt: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const message = link.kind === 'invite'
    ? `Hi ${link.user.name.split(' ')[0]}, here's your Titan Academy login link: ${link.url}`
    : `Hi ${link.user.name.split(' ')[0]}, here's your Titan Academy password reset link: ${link.url}`;
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Modal title={`${link.kind === 'invite' ? 'Invite' : 'Reset'} link for ${link.user.name}`} onClose={onClose}>
      <div className="flex justify-center"><Qr value={link.url} className="h-56 w-56" /></div>
      <p className="mt-3 text-center text-sm text-muted">They can scan this from your screen, or you can send the link.</p>
      <div className="mt-4 break-all rounded-[10px] bg-tone/5 p-3 text-xs text-muted">{link.url}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={() => copy(link.url)}>{copied ? 'Copied ✓' : 'Copy link'}</Button>
        <Button onClick={() => copy(message)}>Copy message</Button>
      </div>
      <p className="mt-3 text-xs text-faint">One-time link. It expires {formatWhen(link.expiresAt)}. Making a new link cancels this one.</p>
    </Modal>
  );
}

function UserModal({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: user?.name ?? '', email: user?.email ?? '', position: user?.position ?? '', tradeRole: user?.tradeRole ?? '',
    isAdmin: user?.isAdmin ?? false, isOffice: user?.isOffice ?? !user?.tradeRole, isTrainer: user?.isTrainer ?? false,
    isAssessor: user?.isAssessor ?? false, isLeadTech: user?.isLeadTech ?? false, isApprentice: user?.isApprentice ?? false,
    isInstallManager: user?.isInstallManager ?? false, isSalesManager: user?.isSalesManager ?? false,
    isDispatch: user?.isDispatch ?? false, signoffAll: user?.signoffAll ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (user) await api(`/api/admin/users/${user.id}`, { method: 'PATCH', body: form });
      else await api('/api/admin/users', { body: form });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const flag = (k: keyof typeof form, label: string, hint: string) => (
    <label className="flex items-start gap-3 rounded-xl px-2 py-1.5 hover:bg-tone/5">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-brand" checked={!!form[k]} onChange={(e) => set(k, e.target.checked)} />
      <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-faint">{hint}</span></span>
    </label>
  );
  return (
    <Modal title={user ? `Edit ${user.name}` : 'Add a person'} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          <Field label="Email (optional)" type="email" hint="They can also add it when they open their invite." value={form.email} onChange={(e) => set('email', e.target.value)} />
          <Field label="Position" value={form.position} onChange={(e) => set('position', e.target.value)} />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-muted">Training path</span>
            <select value={form.tradeRole} onChange={(e) => set('tradeRole', e.target.value)} className="w-full rounded-[6px] border border-line bg-card px-4 py-3 text-title">
              <option value="">None (office staff)</option>
              <option value="install">Install Tech</option>
              <option value="service">Service Tech</option>
              <option value="salestech">Sales Tech (Advanced Sales)</option>
            </select>
          </label>
        </div>
        <div className="grid gap-1 sm:grid-cols-2">
          {flag('isAdmin', 'Admin', 'Manages people, logins and everything else')}
          {flag('isTrainer', 'Trainer', 'Can create and present classes')}
          {flag('isOffice', 'Office staff', 'Can see the admin dashboard')}
          {flag('isApprentice', 'Apprentice', 'Sign-offs are supervised')}
        </div>
        <div>
          <div className="eyebrow mb-1 px-2">Receives sign-off requests</div>
          <div className="grid gap-1 sm:grid-cols-2">
            {flag('isLeadTech', 'Lead tech', 'Technical skills for their own trade')}
            {flag('isInstallManager', 'Install Manager', 'Job-related install items and Service backup (Charlotte, interim)')}
            {flag('isSalesManager', 'Sales Manager', 'Sales and service selling (Harriet)')}
            {flag('isDispatch', 'Dispatch', 'Install handovers (Kim)')}
            {flag('signoffAll', 'Can sign off anything', 'Backup for every sign-off (William, Charlotte)')}
          </div>
        </div>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button>{user ? 'Save' : 'Add person'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- classes
interface Meta {
  groups: Array<{ id: string; name: string }>;
  paths: Array<{ id: string; name: string; modules: Array<{ id: string; title: string; quizLength: number; lessonCount: number; lessonsWritten: number; lessonStatus: string | null }> }>;
  schedule: Array<{ week: number; sessions: Array<{ group: string; modules: string[] }> }>;
}

export function ClassesPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data, error, loading, reload } = useApi<{ classes: any[] }>('/api/admin/classes');
  const meta = useApi<Meta>('/api/admin/meta');
  const [creating, setCreating] = useState(false);
  if (loading || meta.loading) return <Loading />;
  if (error || !data || !meta.data) return <ErrorNote error={error?.message ?? meta.error?.message} />;
  const groupName = (id: string) => meta.data!.groups.find((g) => g.id === id)?.name ?? id;
  const remove = async (id: string) => {
    await api(`/api/admin/classes/${id}`, { method: 'DELETE' }).catch(() => {});
    void reload();
  };
  return (
    <div className="fade-in">
      <PageHead title="Classes" sub="Run a class on the TV while techs follow on their phones.">
        {canPresent(user) && <Button onClick={() => setCreating(true)}>+ New class</Button>}
      </PageHead>
      <Card className="divide-y divide-line">
        {data.classes.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 p-4">
            {c.status === 'live' ? <Badge tone="cyan">Live · {c.join_code}</Badge> : c.status === 'ended' ? <Badge>Ended</Badge> : <Badge tone="amber">Scheduled</Badge>}
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{c.title}</div>
              <div className="text-xs text-muted">
                {groupName(c.group_id)} · {c.module_ids.join(', ')} · {c.status === 'ended' ? `ended ${formatWhen(c.ended_at)}` : formatWhen(c.scheduled_at)}
                {c.attendees ? ` · ${c.attendees} attended` : ''}
              </div>
              {c.status === 'ended' && c.summary?.modules?.length > 0 && (
                <div className="mt-1 text-xs text-faint">
                  {c.summary.modules.filter((m: any) => m.questions).map((m: any) => `${m.moduleId}: avg ${m.averageScore ?? '—'}%`).join(' · ')}
                </div>
              )}
            </div>
            {c.status !== 'ended' && canPresent(user) && (
              <Button size="sm" variant={c.status === 'live' ? 'primary' : 'ghost'} onClick={() => nav(`/present/${c.id}`)}>
                {c.status === 'live' ? 'Back to class' : 'Present'}
              </Button>
            )}
            {c.status === 'ended' && <Button size="sm" variant="subtle" onClick={() => nav(`/present/${c.id}`)}>Summary</Button>}
            {c.status === 'scheduled' && canPresent(user) && <Button size="sm" variant="subtle" onClick={() => remove(c.id)}>Delete</Button>}
          </div>
        ))}
        {!data.classes.length && <div className="p-6 text-muted">No classes yet. Create one to get started.</div>}
      </Card>
      {creating && <NewClassModal meta={meta.data} onClose={() => setCreating(false)} onCreated={(id) => nav(`/present/${id}`)} />}
    </div>
  );
}

function NewClassModal({ meta, onClose, onCreated }: { meta: Meta; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [groupId, setGroupId] = useState('field');
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [when, setWhen] = useState('');
  const [error, setError] = useState<string | null>(null);
  const moduleTitle = (id: string) => meta.paths.flatMap((p) => p.modules).find((m) => m.id === id)?.title ?? id;
  const presets = meta.schedule.flatMap((w) => w.sessions.filter((s) => !s.modules.includes('final')).map((s) => ({ week: w.week, ...s })));
  const applyPreset = (i: number) => {
    const p = presets[i];
    if (!p) return;
    setGroupId(p.group);
    setModuleIds(p.modules);
    setTitle(`Week ${p.week}: ${p.modules.map(moduleTitle).join(' + ')}`.slice(0, 150));
  };
  const toggle = (id: string) => setModuleIds((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ class: { id: string } }>('/api/admin/classes', {
        body: { title, groupId, moduleIds, scheduledAt: when ? new Date(when).toISOString() : null },
      });
      onCreated(r.class.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Modal title="New class" onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Start from the 8-week plan (optional)</span>
          <select defaultValue="" onChange={(e) => applyPreset(Number(e.target.value))} className="w-full rounded-[6px] border border-line bg-card px-4 py-3 text-title">
            <option value="" disabled>Choose a week…</option>
            {presets.map((p, i) => (
              <option key={i} value={i}>Week {p.week} · {meta.groups.find((g) => g.id === p.group)?.name ?? p.group} · {p.modules.join(', ')}</option>
            ))}
          </select>
        </label>
        <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Week 1: The Proximity Standard" />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-muted">Who's it for</span>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="w-full rounded-[6px] border border-line bg-card px-4 py-3 text-title">
              {meta.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <Field label="When (optional)" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-muted">Modules ({moduleIds.length} chosen, presented in this order)</span>
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-line p-3">
            {meta.paths.map((p) => (
              <div key={p.id}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-faint">{p.name}</div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {p.modules.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-tone/5">
                      <input type="checkbox" className="accent-brand" checked={moduleIds.includes(m.id)} onChange={() => toggle(m.id)} />
                      <span className="text-faint">{m.id}</span><span className="truncate">{m.title}</span>
                      {m.quizLength > 0 && <span className="ml-auto text-xs text-good">quiz</span>}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button>Create class</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- content
export function ContentPage() {
  const meta = useApi<Meta>('/api/admin/meta');
  if (meta.loading) return <Loading />;
  if (meta.error || !meta.data) return <ErrorNote error={meta.error?.message} />;
  return (
    <div className="fade-in">
      <PageHead title="Content" sub="Every path and module. Open one to preview its slides at TV size and read its written lessons." />
      <div className="grid gap-5 xl:grid-cols-2">
        {meta.data.paths.map((p) => (
          <Card key={p.id} className="p-5">
            <h2 className="mb-3 card-title">{p.name} <span className="text-muted">({p.modules.length})</span></h2>
            <div className="divide-y divide-line">
              {p.modules.map((m) => (
                <Link key={m.id} to={`/admin/content/${m.id}`} className="flex items-center gap-3 py-2 hover:text-link">
                  <span className="w-9 text-xs text-faint">{m.id}</span>
                  <span className="flex-1 text-sm">{m.title}</span>
                  {m.lessonsWritten > 0 && (
                    <Badge tone={m.lessonStatus === 'approved' ? 'good' : 'amber'}>
                      {m.lessonStatus?.startsWith('sample') ? 'sample for approval' : `${m.lessonStatus === 'approved' ? '' : 'draft · '}lessons ${m.lessonsWritten}/${m.lessonCount}`}
                    </Badge>
                  )}
                  {m.quizLength > 0 ? <Badge tone="good">quiz · {m.quizLength}</Badge> : <Badge>no quiz yet</Badge>}
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function PreviewPage() {
  const { id = '' } = useParams();
  const { data, error, loading } = useApi<{ module: any; deck: Slide[]; lessons: { status: string; lessons: Lesson[] } | null }>(`/api/admin/content/${id}/deck`);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState(false);
  useEffect(() => setI(0), [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!data) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); setI((x) => Math.min(data.deck.length - 1, x + 1)); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorNote error={error?.message} />;
  const m = data.module;
  return (
    <div className="fade-in">
      <Link to="/admin/content" className="text-sm text-muted">← Content</Link>
      <PageHead title={m.title} sub={`${m.pathName} · module ${m.position} of ${m.moduleCount} · ${data.deck.length} slides`}>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="accent-brand" checked={answers} onChange={(e) => setAnswers(e.target.checked)} /> Show answers and full notes
        </label>
      </PageHead>
      <Stage className="aspect-video w-full max-w-6xl rounded-[20px] shadow-panel">
        <TvSlide slide={data.deck[i]} presenter={answers} slideNumber={i + 1} slideCount={data.deck.length} />
      </Stage>
      <div className="mt-4 flex max-w-6xl items-center gap-3">
        <Button variant="ghost" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>← Back</Button>
        <Button onClick={() => setI(Math.min(data.deck.length - 1, i + 1))} disabled={i >= data.deck.length - 1}>Next →</Button>
        <span className="text-sm text-muted">Slide {i + 1} of {data.deck.length} · arrow keys work too</span>
      </div>
      <div className="mt-6 grid max-w-6xl gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-2 card-title">Key points</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm">{m.keyPoints.map((k: string, n: number) => <li key={n}><Marked text={k} /></li>)}</ol>
        </Card>
        <Card className="p-5">
          <h2 className="mb-2 card-title">Lessons</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">{m.lessons.map((l: string, n: number) => <li key={n}><Marked text={l} /></li>)}</ol>
          <p className="mt-3 text-xs text-faint">
            {m.lessonsWritten ? `${m.lessonsWritten} of ${m.lessons.length} lessons written. ` : 'Lessons not written yet. '}
            {m.quizLength ? `${m.quizLength} quiz questions (draft).` : 'No quiz written yet: the class still runs from the key points.'}
          </p>
        </Card>
      </div>
      {data.lessons && data.lessons.lessons.length > 0 && (
        <section className="mt-8 max-w-3xl">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="section-title">Written lessons</h2>
            <Badge tone={data.lessons.status === 'approved' ? 'good' : 'amber'}>{data.lessons.status}</Badge>
          </div>
          <div className="space-y-4">
            {data.lessons.lessons.map((l, n) => (
              <details key={n} className="group rounded-[12px] bg-card shadow-card" open={n === 0}>
                <summary className="flex cursor-pointer list-none items-start gap-3 p-5">
                  <b className="headline text-gold">{n + 1}</b>
                  <span className="flex-1 font-semibold"><Marked text={l.title} /></span>
                  <span className="text-faint transition group-open:rotate-90">›</span>
                </summary>
                <div className="border-t border-line px-5 pb-5 pt-4"><LessonBlocks blocks={l.blocks} /></div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function NeedsAnswersPage() {
  const { data, error, loading } = useApi<{ items: Array<{ pathName: string; moduleId: string; moduleTitle: string; where: string; text: string }> }>('/api/admin/needs-answers');
  if (loading) return <Loading />;
  if (error || !data) return <ErrorNote error={error?.message} />;
  const groups = data.items.reduce<Record<string, typeof data.items>>((acc, it) => {
    (acc[it.pathName] ??= []).push(it);
    return acc;
  }, {});
  return (
    <div className="fade-in">
      <PageHead title="Needs answers" sub={`${data.items.length} items marked CONFIRM or VERIFY. They show as "to be confirmed" on the TV until they're answered.`} />
      {Object.entries(groups).map(([name, items]) => (
        <Card key={name} className="mb-5 p-5">
          <h2 className="mb-3 card-title">{name} <span className="text-muted">({items.length})</span></h2>
          <div className="divide-y divide-line">
            {items.map((it, i) => (
              <div key={i} className="flex gap-4 py-2.5 text-sm">
                <span className="w-10 shrink-0 text-faint">{it.moduleId}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-faint">{it.moduleTitle} · {it.where}</div>
                  <div>{it.text}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
