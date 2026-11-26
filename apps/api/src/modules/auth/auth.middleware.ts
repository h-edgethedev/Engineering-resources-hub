import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ApiError } from '../../errors/ApiError.js';
import { prisma } from '../../infrastructure/database.js';
import { env } from '../../config/env.js';
import { hashSessionToken } from './auth.service.js';
import type { AuthContext } from './auth.types.js';

export const sessionCookieName = 'enghub_session';
export const csrfCookieName = 'enghub_csrf';

function cookieValue(header: string | undefined, name: string): string | undefined {
  const pair = header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!pair) return undefined;
  try { return decodeURIComponent(pair.slice(name.length + 1)); } catch { return undefined; }
}

export const attachSession: RequestHandler = async (request, _response, next) => {
  const token = cookieValue(request.headers.cookie, sessionCookieName);
  if (!token || token.length > 128) { next(); return; }
  try {
    const session = await prisma.authSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: { select: { id: true, email: true, displayName: true, status: true, emailVerifiedAt: true, roleAssignments: { select: { id: true, role: true, universityId: true, scopeKey: true, createdAt: true } } } } },
    });
    if (session && !session.revokedAt && session.expiresAt > new Date() && session.user.status === 'ACTIVE' && session.user.emailVerifiedAt) {
      request.auth = {
        user: session.user,
        sessionId: session.id,
        csrfTokenHash: session.csrfTokenHash,
      } as AuthContext;
    }
    next();
  } catch (error) { next(error); }
};

export const requireAuth: RequestHandler = (request, _response, next) => {
  if (!request.auth) { next(new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to perform this action.')); return; }
  next();
};

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const requireCsrf: RequestHandler = (request, _response, next) => {
  const context = request.auth;
  const cookieToken = cookieValue(request.headers.cookie, csrfCookieName);
  const headerToken = request.get('x-csrf-token');
  if (!context || !cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    next(new ApiError(403, 'CSRF_VALIDATION_FAILED', 'The request CSRF token is missing or invalid.'));
    return;
  }
  const digest = createHash('sha256').update(cookieToken).digest('hex');
  if (!safeEqual(digest, context.csrfTokenHash)) {
    next(new ApiError(403, 'CSRF_VALIDATION_FAILED', 'The request CSRF token is missing or invalid.'));
    return;
  }
  next();
};

export const requireTrustedOrigin: RequestHandler = (request, _response, next) => {
  const origin = request.get('origin');
  if (origin && origin !== new URL(env.webOrigin).origin) {
    next(new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed to perform the request.'));
    return;
  }
  next();
};

export function hasRole(context: AuthContext, ...roles: string[]) {
  return context.user.roleAssignments.some((assignment) => roles.includes(assignment.role));
}

export function hasRoleInUniversity(context: AuthContext, universityId: string, ...roles: string[]) {
  return hasRole(context, 'SUPER_ADMIN') || context.user.roleAssignments.some(
    (assignment) => roles.includes(assignment.role) && assignment.universityId === universityId,
  );
}

export function requireAnyRole(...roles: string[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth || !hasRole(request.auth, ...roles)) {
      next(new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
      return;
    }
    next();
  };
}

export function makeSessionCookies(token: string, csrfToken: string, maxAgeSeconds: number) {
  const secure = env.nodeEnv === 'production' ? '; Secure' : '';
  return [
    `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`,
    makeCsrfCookie(csrfToken, maxAgeSeconds),
  ];
}

export function makeCsrfCookie(csrfToken: string, maxAgeSeconds: number) {
  const secure = env.nodeEnv === 'production' ? '; Secure' : '';
  return `${csrfCookieName}=${encodeURIComponent(csrfToken)}; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookies() {
  const secure = env.nodeEnv === 'production' ? '; Secure' : '';
  return [
    `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    `${csrfCookieName}=; Path=/; SameSite=Lax; Max-Age=0${secure}`,
  ];
}
