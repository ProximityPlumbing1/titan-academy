import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api';
import { Loading } from './ui';
import { clearUserCache, flushQueue } from './offline';

export interface User {
  id: string; name: string; email: string | null; status: 'invited' | 'active' | 'disabled'; position: string | null;
  tradeRole: 'install' | 'service' | 'salestech' | null; trainingGroup: string | null; isAdmin: boolean; isOffice: boolean;
  isTrainer: boolean; isAssessor: boolean; isLeadTech: boolean; isApprentice: boolean; hasPassword: boolean;
  lastLoginAt: string | null; lastSeenAt: string | null;
  isInstallManager: boolean; isSalesManager: boolean; isDispatch: boolean; signoffAll: boolean; supervisorId: string | null;
  reviewsSignoffs: boolean;
}

interface AuthCtx { user: User | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void> }
const Ctx = createContext<AuthCtx>({ user: null, loading: true, refresh: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const u = (await api<{ user: User | null }>('/api/auth/me')).user;
      // A different person on this device: drop the previous person's offline copy first.
      let last: string | null = null;
      try { last = localStorage.getItem('titan:lastUser'); } catch { /* storage blocked */ }
      if (u && last && last !== u.id) await clearUserCache();
      if (u) { try { localStorage.setItem('titan:lastUser', u.id); } catch { /* storage blocked */ } void flushQueue(u.id); }
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  const logout = useCallback(async () => {
    await api('/api/auth/logout', { body: {} }).catch(() => {});
    await clearUserCache();
    try { localStorage.removeItem('titan:lastUser'); } catch { /* storage blocked */ }
    setUser(null);
    location.href = '/login';
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!user) return;
    const on = () => void flushQueue(user.id);
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [user]);
  return <Ctx.Provider value={{ user, loading, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const isStaff = (u: User | null) => !!u && (u.isAdmin || u.isOffice || u.isTrainer);
export const canPresent = (u: User | null) => !!u && (u.isAdmin || u.isTrainer);

export function RequireAuth({ children, staff }: { children: ReactNode; staff?: boolean }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (staff && !isStaff(user)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
