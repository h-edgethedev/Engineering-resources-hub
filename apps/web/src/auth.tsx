import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as AuthEnvelope<unknown>;
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function requestCredentials(path: string, body: Record<string, string>) {
  const response = await fetch(`/api/v1/auth/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readError(response, 'Could not complete that request.'));
  const result = (await response.json()) as AuthEnvelope<{ user: AuthUser }>;
  return result.data.user;
}

async function requestRegistration(body: Record<string, string>) {
  const response = await fetch('/api/v1/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readError(response, 'Could not create your account.'));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery<AuthUser | null, Error>({
    queryKey: authQueryKey,
    queryFn: async () => {
      const response = await fetch('/api/v1/auth/me', { credentials: 'include' });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error(await readError(response, 'Could not restore your sign-in session.'));
      const result = (await response.json()) as AuthEnvelope<{ user: AuthUser }>;
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
      const csrfResponse = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
      if (!csrfResponse.ok) throw new Error(await readError(csrfResponse, 'Could not prepare a secure sign-out request.'));
      const csrfResult = (await csrfResponse.json()) as AuthEnvelope<{ csrfToken: string }>;
      const response = await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfResult.data.csrfToken },
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not sign out.'));
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
