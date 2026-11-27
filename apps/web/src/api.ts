import type { QueryClient } from '@tanstack/react-query';

export interface ApiEnvelope<T> {
  data: T;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
  error?: { code?: string; message?: string; details?: unknown };
}

export class ApiRequestError extends Error {
  constructor(message: string, readonly code?: string, readonly details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const apiUrl = (path: string) => path.startsWith('/api/v1/') ? path : `/api/v1${path.startsWith('/') ? path : `/${path}`}`;

async function readEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok) throw new ApiRequestError(body?.error?.message ?? 'The request could not be completed.', body?.error?.code, body?.error?.details);
  return response.status === 204 ? { data: undefined as T } : body as ApiEnvelope<T>;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  const routePath = path.startsWith('/api/v1/') ? path.slice('/api/v1'.length) : path;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    if (!headers.has('X-CSRF-Token') && !['/auth/login', '/auth/register', '/auth/verify-email', '/auth/resend-verification'].includes(routePath)) {
      const csrfResponse = await fetch(apiUrl('/auth/csrf'), { credentials: 'include' });
      const csrfEnvelope = await readEnvelope<{ csrfToken: string }>(csrfResponse);
      headers.set('X-CSRF-Token', csrfEnvelope.data.csrfToken);
    }
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  }
  return readEnvelope<T>(await fetch(apiUrl(path), { ...init, method, headers, credentials: 'include' }));
}

export async function apiMutation<T>(path: string, init: RequestInit, queryClient?: QueryClient, queryPrefixes: readonly (readonly unknown[])[] = []) {
  const result = await apiRequest<T>(path, init);
  if (queryClient && queryPrefixes.length) {
    await Promise.all(queryPrefixes.map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey] })));
  }
  return result;
}

