import { Router } from 'express';
import {
  findDepartmentInUniversity,
  findUniversityBySlug,
  listUniversities,
} from './academic.service.js';

export const academicRouter = Router();
const isValidSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

academicRouter.get('/universities', async (_request, response, next) => {
  try {
    const universities = await listUniversities();
    response.json({ data: universities });
  } catch (error) {
    next(error);
  }
});

academicRouter.get('/universities/:slug', async (request, response, next) => {
  const { slug } = request.params;
  if (!isValidSlug(slug)) {
    response.status(400).json({
      error: { code: 'INVALID_SLUG', message: 'University slug is invalid.' },
    });
    return;
  }

  try {
    const university = await findUniversityBySlug(slug);
    if (!university) {
      response.status(404).json({
        error: { code: 'UNIVERSITY_NOT_FOUND', message: 'University was not found.' },
      });
      return;
    }

    response.json({ data: university });
  } catch (error) {
    next(error);
  }
});

academicRouter.get(
  '/universities/:universitySlug/faculties/:facultySlug/departments/:departmentSlug',
  async (request, response, next) => {
    const { universitySlug, facultySlug, departmentSlug } = request.params;
    if (![universitySlug, facultySlug, departmentSlug].every(isValidSlug)) {
      response.status(400).json({
        error: { code: 'INVALID_SLUG', message: 'Academic structure slug is invalid.' },
      });
      return;
    }

    try {
      const department = await findDepartmentInUniversity(
        universitySlug,
        facultySlug,
        departmentSlug,
      );
      if (!department) {
        response.status(404).json({
          error: { code: 'DEPARTMENT_NOT_FOUND', message: 'Department was not found.' },
        });
        return;
      }

      response.json({ data: department });
    } catch (error) {
      next(error);
    }
  },
);
