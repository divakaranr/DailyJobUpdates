'use client';

import { hasRole, type Role } from '@jobs/shared';
import { createContext, useCallback, useContext, type ReactNode } from 'react';
import useSWR from 'swr';
import { api } from './api';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<SessionUser>;
  register(name: string, email: string, password: string): Promise<SessionUser>;
  logout(): Promise<void>;
  can(role: Role): boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, mutate } = useSWR<{ user: SessionUser | null }>('/auth/me', (p: string) => api(p), {
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ user: SessionUser }>('/auth/login', { method: 'POST', body: { email, password } });
      await mutate({ user: res.user }, { revalidate: false });
      return res.user;
    },
    [mutate],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await api<{ user: SessionUser }>('/auth/register', { method: 'POST', body: { name, email, password } });
      await mutate({ user: res.user }, { revalidate: false });
      return res.user;
    },
    [mutate],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    await mutate({ user: null }, { revalidate: false });
  }, [mutate]);

  const user = data?.user ?? null;
  const value: AuthContextValue = {
    user,
    loading: isLoading,
    login,
    register,
    logout,
    can: (role) => hasRole(user?.role, role),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
