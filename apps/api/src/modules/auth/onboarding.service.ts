import { ApiError } from '../../errors/ApiError.js';
import { prisma } from '../../infrastructure/database.js';
import type { UserPreferencesInput, UserProfileInput } from './onboarding.schemas.js';

export async function findUserProfile(userId: string) {
  return prisma.userProfile.findUnique({
    where: { userId },
    select: { username: true, avatarUrl: true, bio: true, githubUrl: true, linkedInUrl: true },
  });
}

export async function saveUserProfile(userId: string, profile: UserProfileInput) {
  try {
    return await prisma.userProfile.upsert({ where: { userId }, create: { userId, ...profile }, update: profile });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new ApiError(409, 'USERNAME_ALREADY_TAKEN', 'That username is already in use.');
    }
    throw error;
  }
}

export async function findUserPreferences(userId: string) {
  return prisma.userPreferences.findUnique({
    where: { userId },
    select: { resourceKinds: true, learningInterests: true, learningGoals: true },
  });
}

export async function saveUserPreferences(userId: string, preferences: UserPreferencesInput) {
  return prisma.userPreferences.upsert({ where: { userId }, create: { userId, ...preferences }, update: preferences });
}
