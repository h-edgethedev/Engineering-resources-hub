import type { RequestHandler } from 'express';
import { ApiError } from '../../errors/ApiError.js';
import { findAcademicProfile, saveAcademicProfile } from './academic-profile.service.js';
import type { AcademicProfileInput } from './academic-profile.schemas.js';

export const getAcademicProfileController: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to view your academic profile.');
    response.json({ data: { academicProfile: await findAcademicProfile(request.auth.user.id) } });
  } catch (error) { next(error); }
};

export const saveAcademicProfileController: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to update your academic profile.');
    const profile = await saveAcademicProfile(request.auth.user.id, request.body as AcademicProfileInput);
    response.json({ data: { academicProfile: profile } });
  } catch (error) { next(error); }
};
