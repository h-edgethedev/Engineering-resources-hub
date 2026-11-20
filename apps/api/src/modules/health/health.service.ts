import { prisma } from '../../infrastructure/database.js';

export async function checkDatabaseConnection(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
