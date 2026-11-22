import type { RequestHandler } from 'express';
import { ApiError } from '../../errors/ApiError.js';
import { createSession, findLoginUser, register, revokeSession, rotateCsrfToken, sessionLifetimeMs } from './auth.service.js';
import { clearSessionCookies, makeCsrfCookie, makeSessionCookies } from './auth.middleware.js';
import { loginSchema, registerSchema } from './auth.schemas.js';

function validationError(issues: Array<{ path: PropertyKey[]; message: string[] | string }>) {
  return new ApiError(400, 'VALIDATION_ERROR', 'Request data is invalid.', issues.map((issue) => ({ path: issue.path.join('.'), message: String(issue.message) })));
}

function issueSession(response: Parameters<RequestHandler>[1], session: Awaited<ReturnType<typeof createSession>>) {
  response.append('Set-Cookie', makeSessionCookies(session.token, session.csrfToken, Math.floor(sessionLifetimeMs / 1000)));
}

export const registerController: RequestHandler = async (request, response, next) => {
  try {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues);
    const user = await register(parsed.data);
    const session = await createSession(user.id);
    issueSession(response, session);
    response.status(201).json({ data: { user, csrfToken: session.csrfToken } });
  } catch (error) { next(error); }
};

export const loginController: RequestHandler = async (request, response, next) => {
  try {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues);
    const user = await findLoginUser(parsed.data);
    const session = await createSession(user.id);
    issueSession(response, session);
    response.json({ data: { user, csrfToken: session.csrfToken } });
  } catch (error) { next(error); }
};

export const meController: RequestHandler = (request, response) => {
  if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to view your account.');
  response.json({ data: { user: request.auth.user } });
};

export const csrfController: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to refresh the CSRF token.');
    const csrfToken = await rotateCsrfToken(request.auth.sessionId);
    response.append('Set-Cookie', makeCsrfCookie(csrfToken, Math.floor(sessionLifetimeMs / 1000)));
    response.json({ data: { csrfToken } });
  } catch (error) { next(error); }
};

export const logoutController: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to perform this action.');
    await revokeSession(request.auth.sessionId);
    response.append('Set-Cookie', clearSessionCookies());
    response.status(204).end();
  } catch (error) { next(error); }
};
