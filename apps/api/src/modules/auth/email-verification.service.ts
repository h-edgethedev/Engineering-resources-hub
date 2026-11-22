import { createHash, randomBytes } from 'node:crypto';
import { ApiError } from '../../errors/ApiError.js';
import { prisma } from '../../infrastructure/database.js';
import { env } from '../../config/env.js';
import { sendVerificationEmail } from './email.service.js';

const verificationLifetimeMs = 30 * 60 * 1000;

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function sendEmailVerification(user: { id: string; email: string; displayName: string }) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    await transaction.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await transaction.emailVerificationToken.create({
      data: { userId: user.id, tokenHash: digest(token), expiresAt: new Date(now.getTime() + verificationLifetimeMs) },
    });
  });
  const verificationUrl = new URL('/verify-email', env.webOrigin);
  verificationUrl.searchParams.set('token', token);
  try {
    await sendVerificationEmail(user.email, user.displayName, verificationUrl.toString());
  } catch (error) {
    await prisma.emailVerificationToken.deleteMany({ where: { tokenHash: digest(token) } });
    throw error;
  }
}

export async function resendEmailVerification(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, displayName: true, emailVerifiedAt: true } });
  if (!user || user.emailVerifiedAt) return;
  await sendEmailVerification(user);
}

export async function verifyEmailAddress(token: string) {
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: digest(token) } });
  const now = new Date();
  if (!record || record.usedAt || record.expiresAt <= now) {
    throw new ApiError(400, 'INVALID_OR_EXPIRED_VERIFICATION_TOKEN', 'This verification link is invalid or has expired. Request a new verification email.');
  }

  await prisma.$transaction(async (transaction) => {
    const result = await transaction.emailVerificationToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (result.count !== 1) throw new ApiError(400, 'INVALID_OR_EXPIRED_VERIFICATION_TOKEN', 'This verification link is invalid or has expired. Request a new verification email.');
    await transaction.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: now } });
  });
}
