import type { RequestHandler } from 'express';
import { ApiError } from '../../errors/ApiError.js';
import { findUserPreferences, findUserProfile, saveUserPreferences, saveUserProfile } from './onboarding.service.js';
import type { UserPreferencesInput, UserProfileInput } from './onboarding.schemas.js';
import { userPreferencesInputSchema, userProfileInputSchema } from './onboarding.schemas.js';

export const getUserProfileController: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to view your profile.');
    response.json({ data: { profile: await findUserProfile(request.auth.user.id) } });
  } catch (error) { next(error); }
};

export const saveUserProfileController: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to update your profile.');
    const profile = await saveUserProfile(request.auth.user.id, userProfileInputSchema.parse(request.body) as UserProfileInput);
    response.json({ data: { profile } });
  } catch (error) { next(error); }
};

export const getUserPreferencesController: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to view your preferences.');
    response.json({ data: { preferences: await findUserPreferences(request.auth.user.id) } });
  } catch (error) { next(error); }
};

export const saveUserPreferencesController: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to update your preferences.');
    const preferences = await saveUserPreferences(request.auth.user.id, userPreferencesInputSchema.parse(request.body) as UserPreferencesInput);
    response.json({ data: { preferences } });
  } catch (error) { next(error); }
};
