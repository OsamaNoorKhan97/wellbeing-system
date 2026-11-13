import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SESSION_EXPIRED_EVENT, tokenStore } from '../lib/api';
import { authService } from '../services';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  /** True while the stored session is being verified on first load. */
  initializing: boolean;
  sessionExpired: boolean;
  login: (identifier: string, password: string, rememberMe: boolean) => Promise<User>;
  logout: () => void;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(() => tokenStore.get() !== null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (!tokenStore.get()) return;
    authService
      .me()
      .then((response) => setUser(response.data))
      .catch(() => tokenStore.clear())
      .finally(() => setInitializing(false));
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setSessionExpired(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (identifier: string, password: string, rememberMe: boolean) => {
    const { data } = await authService.login(identifier, password, rememberMe);
    tokenStore.set(data.token, rememberMe);
    setSessionExpired(false);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setSessionExpired(false);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, initializing, sessionExpired, login, logout, setUser }),
    [user, initializing, sessionExpired, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
