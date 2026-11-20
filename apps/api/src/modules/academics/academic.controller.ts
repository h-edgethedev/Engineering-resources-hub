import type { Request, RequestHandler } from 'express';
import { ApiError } from '../../errors/ApiError.js';
import {
  findCourseById,
  findDepartment,
  findDepartmentInUniversity,
  findFaculty,
  findProgrammeInDepartment,
  findUniversityBySlug,
  listCourses,
  listDepartments,
  listFaculties,
  listProgrammesInDepartment,
  listUniversities,
} from './academic.service.js';
import { courseFiltersSchema } from './academic.schemas.js';

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

export const listFacultiesController: RequestHandler = async (request, response, next) => {
  try {
    const universitySlug = routeParam(request, 'universitySlug');
    if (!await findUniversityBySlug(universitySlug)) throw new ApiError(404, 'UNIVERSITY_NOT_FOUND', 'University was not found.');
    response.json({ data: await listFaculties(universitySlug) });
  } catch (error) { next(error); }
};

export const listDepartmentsController: RequestHandler = async (request, response, next) => {
  try {
    const universitySlug = routeParam(request, 'universitySlug');
    const facultySlug = routeParam(request, 'facultySlug');
    if (!await findFaculty(universitySlug, facultySlug)) throw new ApiError(404, 'FACULTY_NOT_FOUND', 'Faculty was not found.');
    response.json({ data: await listDepartments(universitySlug, facultySlug) });
  } catch (error) { next(error); }
};

export const listProgrammesController: RequestHandler = async (request, response, next) => {
  try {
    const universitySlug = routeParam(request, 'universitySlug');
    const facultySlug = routeParam(request, 'facultySlug');
    const departmentSlug = routeParam(request, 'departmentSlug');
    if (!await findDepartment(universitySlug, facultySlug, departmentSlug)) throw new ApiError(404, 'DEPARTMENT_NOT_FOUND', 'Department was not found.');
    response.json({ data: await listProgrammesInDepartment(universitySlug, facultySlug, departmentSlug) });
  } catch (error) { next(error); }
};

export const getProgrammeController: RequestHandler = async (request, response, next) => {
  try {
    const programme = await findProgrammeInDepartment(
      routeParam(request, 'universitySlug'), routeParam(request, 'facultySlug'),
      routeParam(request, 'departmentSlug'), routeParam(request, 'programmeSlug'),
    );
    if (!programme) throw new ApiError(404, 'PROGRAMME_NOT_FOUND', 'Programme was not found.');
    response.json({ data: programme });
  } catch (error) { next(error); }
};

export const listCoursesController: RequestHandler = async (request, response, next) => {
  try {
    const parsed = courseFiltersSchema.safeParse(request.query);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Request data is invalid.', parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
    const result = await listCourses(parsed.data);
    response.json({ data: result.items, meta: result.meta });
  } catch (error) { next(error); }
};

export const getCourseController: RequestHandler = async (request, response, next) => {
  try {
    const course = await findCourseById(routeParam(request, 'courseId'));
    if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'Course was not found.');
    response.json({ data: course });
  } catch (error) { next(error); }
};
