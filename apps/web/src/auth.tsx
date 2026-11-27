import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './api';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  status: string;
  roleAssignments: Array<{
    id: string;
    role: 'SUPER_ADMIN' | 'UNIVERSITY_ADMIN' | 'MODERATOR' | 'CONTRIBUTOR' | 'STUDENT';
    universityId: string | null;
    scopeKey: string;
    createdAt: string;
  }>;
}

interface AuthEnvelope<T> {
  data: T;
  error?: { message?: string };
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  error: Error | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (displayName: string, email: string, password: string) => Promise<void>;
  acceptVerifiedSession: (user: AuthUser) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const authQueryKey = ['auth', 'me'];

async function requestCredentials(path: string, body: Record<string, string>) {
  const result = await apiRequest<{ user: AuthUser }>(`/auth/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return result.data.user;
}

async function requestRegistration(body: Record<string, string>) {
  await apiRequest('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery<AuthUser | null, Error>({
    queryKey: authQueryKey,
    queryFn: async () => {
      let result: AuthEnvelope<{ user: AuthUser }>;
      try { result = await apiRequest<{ user: AuthUser }>('/auth/me'); }
      catch (error) { if (error instanceof Error && 'code' in error && error.code === 'AUTHENTICATION_REQUIRED') return null; throw error; }
      return result.data.user;
    },
    retry: false,
    staleTime: 30_000,
  });

  const value = useMemo<AuthContextValue>(() => ({
    user: sessionQuery.data ?? null,
    isLoading: sessionQuery.isPending,
    error: sessionQuery.error,
    signIn: async (email, password) => {
      const user = await requestCredentials('login', { email, password });
      queryClient.setQueryData(authQueryKey, user);
    },
    signUp: async (displayName, email, password) => {
      await requestRegistration({ displayName, email, password });
    },
    acceptVerifiedSession: (user) => { queryClient.setQueryData(authQueryKey, user); },
    signOut: async () => {
      await apiRequest<void>('/auth/logout', { method: 'POST' });
      queryClient.setQueryData(authQueryKey, null);
    },
    refresh: async () => { await queryClient.invalidateQueries({ queryKey: authQueryKey }); },
  }), [queryClient, sessionQuery.data, sessionQuery.error, sessionQuery.isPending]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
