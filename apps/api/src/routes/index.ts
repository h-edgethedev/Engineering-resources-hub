import { Router } from 'express';
import { academicRouter } from '../modules/academics/academic.routes.js';

export const apiRouter = Router();

apiRouter.use(academicRouter);
