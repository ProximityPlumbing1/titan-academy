import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api';
import { Loading } from './ui';

export interface User {
  id: string; name: string; email: string | null; status: 'invited' | 'active' | 'disabled'; position: string | null;
  tradeRole: 'install' | 'service' | 'salestech' | null; trainingGroup: string | null; isAdmin: boolean; isOffice: boolean;
  isTrainer: boolean; isAssessor: boolean; isLeadTech: boolean; isApprentice: boolean; hasPassword: boolean;
  lastLoginAt: string | null; lastSeenAt: string | null;
}

interface AuthCtx { user: User | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void> }
const Ctx = createContext<AuthCtx>({ user: null, loading: true, refresh: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setUser((await api<{ user: User | null }>('/api/auth/me')).user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  const logout = useCallback(async () => {
    await api('/api/auth/logout', { body: {} }).catch(() => {});
    setUser(null);
    location.href = '/login';
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
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
