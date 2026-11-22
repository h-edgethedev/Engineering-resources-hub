import { ApiError } from '../../errors/ApiError.js';
import { prisma } from '../../infrastructure/database.js';
import { hasRoleInUniversity } from './auth.middleware.js';
import type { AuthContext } from './auth.types.js';
import type { z } from 'zod';
import type { grantRoleSchema } from './auth.schemas.js';

type GrantRoleInput = z.infer<typeof grantRoleSchema>;

export async function grantRole(userId: string, input: GrantRoleInput, actor: AuthContext) {
  if (userId === actor.user.id) throw new ApiError(403, 'CANNOT_GRANT_ROLE_TO_SELF', 'You cannot grant a role to your own account.');
  if (input.role === 'STUDENT') throw new ApiError(400, 'STUDENT_ROLE_AUTOMATIC', 'Student access is assigned at registration.');

  const isSuperAdmin = actor.user.roleAssignments.some((assignment) => assignment.role === 'SUPER_ADMIN');
  if (input.role === 'SUPER_ADMIN') {
    if (!isSuperAdmin || input.universityId) throw new ApiError(403, 'FORBIDDEN', 'Only a Super Administrator can grant a platform-wide administrator role.');
  } else {
    if (!input.universityId) throw new ApiError(400, 'UNIVERSITY_SCOPE_REQUIRED', 'This role requires a university scope.');
    if (!isSuperAdmin && (!hasRoleInUniversity(actor, input.universityId, 'UNIVERSITY_ADMIN') || !['MODERATOR', 'CONTRIBUTOR'].includes(input.role))) {
      throw new ApiError(403, 'FORBIDDEN', 'You cannot grant this role in the requested university.');
    }
    const university = await prisma.university.findFirst({ where: { id: input.universityId, status: 'ACTIVE' }, select: { id: true } });
    if (!university) throw new ApiError(404, 'UNIVERSITY_NOT_FOUND', 'University was not found.');
  }

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } });
  if (!target || target.status !== 'ACTIVE') throw new ApiError(404, 'USER_NOT_FOUND', 'Active user was not found.');
  const scopeKey = input.universityId ? `university:${input.universityId}` : 'global';
  try {
    return await prisma.roleAssignment.create({
      data: { userId, role: input.role, universityId: input.universityId ?? null, scopeKey, grantedById: actor.user.id },
      select: { id: true, role: true, universityId: true, scopeKey: true, createdAt: true },
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new ApiError(409, 'ROLE_ALREADY_ASSIGNED', 'This role is already assigned in the requested scope.');
    }
    throw error;
  }
}

export async function revokeRole(grantId: string, actor: AuthContext) {
  const grant = await prisma.roleAssignment.findUnique({ where: { id: grantId }, select: { id: true, role: true, universityId: true, userId: true } });
  if (!grant) throw new ApiError(404, 'ROLE_ASSIGNMENT_NOT_FOUND', 'Role assignment was not found.');
  if (grant.role === 'STUDENT') throw new ApiError(400, 'STUDENT_ROLE_REQUIRED', 'Student access cannot be revoked through role management. Suspend the account instead.');

  const isSuperAdmin = actor.user.roleAssignments.some((assignment) => assignment.role === 'SUPER_ADMIN');
  if (grant.role === 'SUPER_ADMIN') {
    if (!isSuperAdmin) throw new ApiError(403, 'FORBIDDEN', 'Only a Super Administrator can revoke a platform-wide administrator role.');
    const activeSuperAdmins = await prisma.roleAssignment.count({ where: { role: 'SUPER_ADMIN', user: { status: 'ACTIVE' } } });
    if (activeSuperAdmins <= 1) throw new ApiError(409, 'LAST_SUPER_ADMIN', 'The last active Super Administrator cannot be removed.');
  } else if (!grant.universityId || (!isSuperAdmin && (!hasRoleInUniversity(actor, grant.universityId, 'UNIVERSITY_ADMIN') || !['MODERATOR', 'CONTRIBUTOR'].includes(grant.role)))) {
    throw new ApiError(403, 'FORBIDDEN', 'You cannot revoke this role assignment.');
  }
  await prisma.roleAssignment.delete({ where: { id: grantId } });
}
