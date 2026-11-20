import type { Request, RequestHandler } from 'express';
import { ApiError } from '../../errors/ApiError.js';
import {
  findDepartmentInUniversity,
  findUniversityBySlug,
  listUniversities,
} from './academic.service.js';

function routeParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== 'string') {
    throw new ApiError(400, 'INVALID_ROUTE_PARAMETER', 'A required route parameter is invalid.');
  }
  return value;
}

export const listUniversitiesController: RequestHandler = async (_request, response, next) => {
  try {
    response.json({ data: await listUniversities() });
  } catch (error) {
    next(error);
  }
};

export const getUniversityController: RequestHandler = async (request, response, next) => {
  try {
    const university = await findUniversityBySlug(routeParam(request, 'slug'));
    if (!university) {
      throw new ApiError(404, 'UNIVERSITY_NOT_FOUND', 'University was not found.');
    }
    response.json({ data: university });
  } catch (error) {
    next(error);
  }
};

export const getDepartmentController: RequestHandler = async (request, response, next) => {
  try {
    const department = await findDepartmentInUniversity(
      routeParam(request, 'universitySlug'),
      routeParam(request, 'facultySlug'),
      routeParam(request, 'departmentSlug'),
    );
    if (!department) {
      throw new ApiError(404, 'DEPARTMENT_NOT_FOUND', 'Department was not found.');
    }
    response.json({ data: department });
  } catch (error) {
    next(error);
  }
};
