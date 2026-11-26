import type { RequestHandler } from 'express';
import { ApiError } from '../../errors/ApiError.js';
import { prisma } from '../../infrastructure/database.js';
import { createSession, findLoginUser, register, revokeSession, rotateCsrfToken, sessionLifetimeMs } from './auth.service.js';
import { clearSessionCookies, makeCsrfCookie, makeSessionCookies } from './auth.middleware.js';
import { loginSchema, registerSchema, resendVerificationSchema, verifyEmailSchema } from './auth.schemas.js';
import { resendEmailVerification, sendEmailVerification, verifyEmailAddress } from './email-verification.service.js';

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
    try {
      await sendEmailVerification(user);
    } catch {
      throw new ApiError(503, 'VERIFICATION_EMAIL_UNAVAILABLE', 'Your account was created, but we could not send the verification email. Use the resend option or check the API email configuration.');
    }
    response.status(201).json({ data: { email: user.email, verificationRequired: true } });
  } catch (error) { next(error); }
};

export const verifyEmailController: RequestHandler = async (request, response, next) => {
  try {
    const parsed = verifyEmailSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues);
    const userId = await verifyEmailAddress(parsed.data.token);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, status: true, roleAssignments: { select: { id: true, role: true, universityId: true, scopeKey: true, createdAt: true } } },
    });
    const session = await createSession(userId);
    response.append('Set-Cookie', makeSessionCookies(session.token, session.csrfToken, Math.floor(sessionLifetimeMs / 1000)));
    response.json({ data: { verified: true, user, csrfToken: session.csrfToken } });
  } catch (error) { next(error); }
};

export const resendVerificationController: RequestHandler = async (request, response, next) => {
  try {
    const parsed = resendVerificationSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues);
    try { await resendEmailVerification(parsed.data.email); }
    catch (error) {
      console.error('[auth] Could not send a verification email.', error instanceof Error ? error.message : 'Unexpected email delivery error.');
    }
    response.json({ data: { message: 'If the address needs verification, a new link will be sent shortly.' } });
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
