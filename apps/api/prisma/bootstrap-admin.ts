import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

function requiredEnvironmentValue(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Set ${name} for this process.`);
  return normalized;
}

const email = requiredEnvironmentValue(process.env.BOOTSTRAP_ADMIN_EMAIL, 'BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
const displayName = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Platform Administrator';
const password = requiredEnvironmentValue(process.env.BOOTSTRAP_ADMIN_PASSWORD, 'BOOTSTRAP_ADMIN_PASSWORD');
const connectionString = requiredEnvironmentValue(process.env.DATABASE_URL, 'DATABASE_URL');
if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
  throw new Error('Bootstrap password must be at least 12 characters and no more than 72 UTF-8 bytes.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const existingSuperAdmin = await prisma.roleAssignment.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true } });
  if (existingSuperAdmin) throw new Error('A Super Administrator already exists; use the authenticated role management API.');
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) throw new Error('That email already belongs to an account; use an account administrator to grant roles.');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      displayName,
      passwordHash,
      roleAssignments: { create: { role: 'SUPER_ADMIN', scopeKey: 'global' } },
    },
    select: { id: true, email: true },
  });
  console.info(`Created the initial Super Administrator account for ${user.email}.`);
}

main()
  .catch((error: unknown) => {
    console.error('Super Administrator bootstrap failed.', error instanceof Error ? error.message : 'Unexpected error.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
