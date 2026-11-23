import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validateRequest } from '../../middleware/validateRequest.js';
import { requireAnyRole, requireAuth, requireCsrf, requireTrustedOrigin } from './auth.middleware.js';
import { csrfController, loginController, logoutController, meController, registerController, resendVerificationController, verifyEmailController } from './auth.controller.js';
import { grantIdParamsSchema, grantRoleSchema, resendVerificationSchema, userIdParamsSchema, verifyEmailSchema } from './auth.schemas.js';
import { grantRole, revokeRole } from './role.service.js';
import { ApiError } from '../../errors/ApiError.js';
import { getAcademicProfileController, saveAcademicProfileController } from './academic-profile.controller.js';
import { academicProfileInputSchema } from './academic-profile.schemas.js';
import { userPreferencesInputSchema, userProfileInputSchema } from './onboarding.schemas.js';
import { getUserPreferencesController, getUserProfileController, saveUserPreferencesController, saveUserProfileController } from './onboarding.controller.js';

export const authRouter = Router();

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({ error: { code: 'AUTH_RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } }),
});

const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({ error: { code: 'AUTH_RATE_LIMITED', message: 'Too many verification requests. Try again later.' } }),
});

authRouter.post('/register', requireTrustedOrigin, credentialLimiter, registerController);
authRouter.post('/login', requireTrustedOrigin, credentialLimiter, loginController);
authRouter.post('/verify-email', requireTrustedOrigin, verificationLimiter, validateRequest({ body: verifyEmailSchema }), verifyEmailController);
authRouter.post('/resend-verification', requireTrustedOrigin, verificationLimiter, validateRequest({ body: resendVerificationSchema }), resendVerificationController);
authRouter.get('/me', requireAuth, meController);
authRouter.get('/me/academic-profile', requireAuth, getAcademicProfileController);
authRouter.put('/me/academic-profile', requireAuth, validateRequest({ body: academicProfileInputSchema }), saveAcademicProfileController);
authRouter.get('/me/profile', requireAuth, getUserProfileController);
authRouter.put('/me/profile', requireAuth, validateRequest({ body: userProfileInputSchema }), saveUserProfileController);
authRouter.get('/me/preferences', requireAuth, getUserPreferencesController);
authRouter.put('/me/preferences', requireAuth, validateRequest({ body: userPreferencesInputSchema }), saveUserPreferencesController);
authRouter.get('/csrf', requireAuth, csrfController);
authRouter.post('/logout', requireAuth, requireCsrf, logoutController);

authRouter.post('/admin/users/:userId/roles', requireAuth, requireCsrf, requireAnyRole('SUPER_ADMIN', 'UNIVERSITY_ADMIN'), validateRequest({ params: userIdParamsSchema, body: grantRoleSchema }), async (request, response, next) => {
  try {
    if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to perform this action.');
    const grant = await grantRole(request.params.userId as string, request.body as Parameters<typeof grantRole>[1], request.auth);
    response.status(201).json({ data: grant });
  } catch (error) { next(error); }
});

authRouter.delete('/admin/role-assignments/:grantId', requireAuth, requireCsrf, requireAnyRole('SUPER_ADMIN', 'UNIVERSITY_ADMIN'), validateRequest({ params: grantIdParamsSchema }), async (request, response, next) => {
  try {
    if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to perform this action.');
    await revokeRole(request.params.grantId as string, request.auth);
    response.status(204).end();
  } catch (error) { next(error); }
});
