import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the academic structure.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const university = await prisma.university.upsert({
    where: { slug: 'university-of-lagos' },
    update: { name: 'University of Lagos', countryCode: 'NG' },
    create: {
      name: 'University of Lagos',
      slug: 'university-of-lagos',
      countryCode: 'NG',
    },
  });

  const faculty = await prisma.faculty.upsert({
    where: {
      universityId_slug: {
        universityId: university.id,
        slug: 'engineering',
      },
    },
    update: { name: 'Faculty of Engineering' },
    create: {
      universityId: university.id,
      name: 'Faculty of Engineering',
      slug: 'engineering',
    },
  });

  const departments = [
    { name: 'Computer Engineering', slug: 'computer-engineering' },
    {
      name: 'Electrical and Electronics Engineering',
      slug: 'electrical-and-electronics-engineering',
    },
  ];

  for (const department of departments) {
    await prisma.department.upsert({
      where: {
        facultyId_slug: {
          facultyId: faculty.id,
          slug: department.slug,
        },
      },
      update: { name: department.name },
      create: { ...department, facultyId: faculty.id },
    });
  }

  console.info(`Seeded ${university.name} / ${faculty.name} / ${departments.length} departments.`);
}

main()
  .catch((error: unknown) => {
    console.error('Academic structure seed failed.', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
