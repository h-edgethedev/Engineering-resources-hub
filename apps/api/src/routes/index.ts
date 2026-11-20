import { Router } from 'express';
import { academicRouter } from '../modules/academics/academic.routes.js';
import { resourceRouter } from '../modules/resources/resource.routes.js';

export const apiRouter = Router();

apiRouter.use(academicRouter);
apiRouter.use('/resources', resourceRouter);
