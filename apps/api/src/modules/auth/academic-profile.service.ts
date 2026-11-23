import { ApiError } from '../../errors/ApiError.js';
import { prisma } from '../../infrastructure/database.js';
import type { AcademicProfileInput } from './academic-profile.schemas.js';

const academicProfileInclude = {
  university: { select: { id: true, name: true, slug: true, countryCode: true } },
  faculty: { select: { id: true, name: true, slug: true } },
  department: { select: { id: true, name: true, slug: true } },
  programme: { select: { id: true, name: true, slug: true } },
  currentLevel: { select: { id: true, code: true, label: true, ordinal: true } },
  currentSemester: { select: { id: true, code: true, label: true, ordinal: true } },
} as const;

export async function findAcademicProfile(userId: string) {
  return prisma.academicProfile.findUnique({ where: { userId }, include: academicProfileInclude });
}

async function validateAcademicRelationships(profile: AcademicProfileInput) {
  if (profile.universityId) {
    const university = await prisma.university.findFirst({ where: { id: profile.universityId, status: 'ACTIVE' }, select: { id: true } });
    if (!university) throw new ApiError(422, 'INVALID_ACADEMIC_PROFILE', 'The selected university is not available.');
  }
  if (profile.facultyId) {
    const faculty = await prisma.faculty.findFirst({ where: { id: profile.facultyId, universityId: profile.universityId as string }, select: { id: true } });
    if (!faculty) throw new ApiError(422, 'INVALID_ACADEMIC_PROFILE', 'The selected faculty does not belong to the selected university.');
  }
  if (profile.departmentId) {
    const department = await prisma.department.findFirst({ where: { id: profile.departmentId, facultyId: profile.facultyId as string }, select: { id: true } });
    if (!department) throw new ApiError(422, 'INVALID_ACADEMIC_PROFILE', 'The selected department does not belong to the selected faculty.');
  }
  if (profile.programmeId) {
    const programme = await prisma.programme.findFirst({ where: { id: profile.programmeId, departmentId: profile.departmentId as string, status: 'ACTIVE' }, select: { id: true } });
    if (!programme) throw new ApiError(422, 'INVALID_ACADEMIC_PROFILE', 'The selected programme does not belong to the selected department.');
  }
  if (profile.currentLevelId) {
    const level = await prisma.programmeLevel.findFirst({ where: { id: profile.currentLevelId, programmeId: profile.programmeId as string }, select: { id: true } });
    if (!level) throw new ApiError(422, 'INVALID_ACADEMIC_PROFILE', 'The selected level does not belong to the selected programme.');
  }
  if (profile.currentSemesterId) {
    const semester = await prisma.semester.findFirst({ where: { id: profile.currentSemesterId, programmeLevelId: profile.currentLevelId as string }, select: { id: true } });
    if (!semester) throw new ApiError(422, 'INVALID_ACADEMIC_PROFILE', 'The selected semester does not belong to the selected level.');
  }
}

export async function saveAcademicProfile(userId: string, profile: AcademicProfileInput) {
  await validateAcademicRelationships(profile);
  return prisma.academicProfile.upsert({
    where: { userId },
    create: { userId, ...profile },
    update: profile,
    include: academicProfileInclude,
  });
}
