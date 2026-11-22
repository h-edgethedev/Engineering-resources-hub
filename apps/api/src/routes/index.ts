import { Router } from 'express';
import { academicRouter } from '../modules/academics/academic.routes.js';
import { resourceRouter } from '../modules/resources/resource.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';

export const apiRouter = Router();

apiRouter.use(academicRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/resources', resourceRouter);
