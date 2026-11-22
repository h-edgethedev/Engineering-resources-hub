import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ApiError } from '../../errors/ApiError.js';
import { prisma } from '../../infrastructure/database.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

const passwordRounds = 12;
const dummyPasswordHash = bcrypt.hash('enghub-invalid-account-password', passwordRounds);
export const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  createdAt: true,
  roleAssignments: { select: { id: true, role: true, universityId: true, scopeKey: true } },
} as const;

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function register(input: RegisterInput) {
  const passwordHash = await bcrypt.hash(input.password, passwordRounds);
  try {
    return await prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        passwordHash,
        roleAssignments: { create: { role: 'STUDENT', scopeKey: 'global' } },
      },
      select: publicUserSelect,
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new ApiError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');
    }
    throw error;
  }
}

export async function findLoginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const hash = user?.passwordHash ?? await dummyPasswordHash;
  const passwordMatches = await bcrypt.compare(input.password, hash);
  if (!user || user.status !== 'ACTIVE' || !passwordMatches) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  return prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: publicUserSelect });
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);
  const session = await prisma.authSession.create({
    data: { userId, tokenHash: digest(token), csrfTokenHash: digest(csrfToken), expiresAt },
    select: { id: true },
  });
  return { id: session.id, token, csrfToken, csrfTokenHash: digest(csrfToken), expiresAt };
}

export async function rotateCsrfToken(sessionId: string) {
  const csrfToken = randomBytes(32).toString('base64url');
  await prisma.authSession.update({ where: { id: sessionId }, data: { csrfTokenHash: digest(csrfToken) } });
  return csrfToken;
}

export function hashSessionToken(token: string) {
  return digest(token);
}

export async function revokeSession(sessionId: string) {
  await prisma.authSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
}
