import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validateRequest } from '../../middleware/validateRequest.js';
import { requireAnyRole, requireAuth, requireCsrf, requireTrustedOrigin } from './auth.middleware.js';
import { csrfController, loginController, logoutController, meController, registerController } from './auth.controller.js';
import { grantIdParamsSchema, grantRoleSchema, userIdParamsSchema } from './auth.schemas.js';
import { grantRole, revokeRole } from './role.service.js';
import { ApiError } from '../../errors/ApiError.js';

export const authRouter = Router();

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({ error: { code: 'AUTH_RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } }),
});

authRouter.post('/register', requireTrustedOrigin, credentialLimiter, registerController);
authRouter.post('/login', requireTrustedOrigin, credentialLimiter, loginController);
authRouter.get('/me', requireAuth, meController);
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
