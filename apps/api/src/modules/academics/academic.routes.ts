import { Router } from 'express';
import {
  getDepartmentController,
  getUniversityController,
  listUniversitiesController,
} from './academic.controller.js';
import { departmentParamsSchema, universityParamsSchema } from './academic.schemas.js';
import { validateRequest } from '../../middleware/validateRequest.js';

export const academicRouter = Router();

academicRouter.get('/universities', listUniversitiesController);
academicRouter.get(
  '/universities/:slug',
  validateRequest({ params: universityParamsSchema }),
  getUniversityController,
);
academicRouter.get(
  '/universities/:universitySlug/faculties/:facultySlug/departments/:departmentSlug',
  validateRequest({ params: departmentParamsSchema }),
  getDepartmentController,
);
