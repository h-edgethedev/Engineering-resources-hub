import { Router } from 'express';
import {
  getDepartmentController,
  getCourseController,
  getProgrammeController,
  getUniversityController,
  listCoursesController,
  listDepartmentsController,
  listFacultiesController,
  listProgrammesController,
  listUniversitiesController,
} from './academic.controller.js';
import { courseParamsSchema, departmentParamsSchema, facultyParamsSchema, programmeParamsSchema, universityParamsSchema, universitySlugParamsSchema } from './academic.schemas.js';
import { validateRequest } from '../../middleware/validateRequest.js';

export const academicRouter = Router();

academicRouter.get('/universities', listUniversitiesController);
academicRouter.get(
  '/universities/:slug',
  validateRequest({ params: universityParamsSchema }),
  getUniversityController,
);
academicRouter.get('/universities/:universitySlug/faculties', validateRequest({ params: universitySlugParamsSchema }), listFacultiesController);
academicRouter.get('/universities/:universitySlug/faculties/:facultySlug/departments', validateRequest({ params: facultyParamsSchema }), listDepartmentsController);
academicRouter.get('/universities/:universitySlug/faculties/:facultySlug/departments/:departmentSlug/programmes', validateRequest({ params: departmentParamsSchema }), listProgrammesController);
academicRouter.get('/universities/:universitySlug/faculties/:facultySlug/departments/:departmentSlug/programmes/:programmeSlug', validateRequest({ params: programmeParamsSchema }), getProgrammeController);
academicRouter.get(
  '/universities/:universitySlug/faculties/:facultySlug/departments/:departmentSlug',
  validateRequest({ params: departmentParamsSchema }),
  getDepartmentController,
);
academicRouter.get('/courses', listCoursesController);
academicRouter.get('/courses/:courseId', validateRequest({ params: courseParamsSchema }), getCourseController);
