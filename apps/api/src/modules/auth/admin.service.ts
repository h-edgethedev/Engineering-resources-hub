import { prisma } from '../../infrastructure/database.js';
import type { AdminUsersQuery } from './admin.schemas.js';

export async function listUsers(query: AdminUsersQuery) {
  const where = query.q ? {
    OR: [
      { email: { contains: query.q, mode: 'insensitive' as const } },
      { displayName: { contains: query.q, mode: 'insensitive' as const } },
    ],
  } : {};
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ displayName: 'asc' }, { email: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        emailVerifiedAt: true,
        roleAssignments: { select: { id: true, role: true, universityId: true, scopeKey: true, university: { select: { name: true } } } },
      },
    }),
  ]);
  return { users, meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
}
