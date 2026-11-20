import { prisma } from '../../infrastructure/database.js';

export async function listUniversities() {
  return prisma.university.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      countryCode: true,
      _count: { select: { faculties: true } },
    },
  });
}

export async function findUniversityBySlug(slug: string) {
  return prisma.university.findFirst({
    where: { slug, status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      slug: true,
      countryCode: true,
      faculties: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          departments: {
            orderBy: { name: 'asc' },
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });
}

export async function findDepartmentInUniversity(
  universitySlug: string,
  facultySlug: string,
  departmentSlug: string,
) {
  return prisma.department.findFirst({
    where: {
      slug: departmentSlug,
      faculty: {
        slug: facultySlug,
        university: { slug: universitySlug, status: 'ACTIVE' },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      faculty: { select: { name: true, slug: true } },
      programmes: {
        where: { status: 'ACTIVE' },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          award: true,
          durationYears: true,
          levels: {
            orderBy: { ordinal: 'asc' },
            select: {
              id: true,
              code: true,
              label: true,
              ordinal: true,
              semesters: {
                orderBy: { ordinal: 'asc' },
                select: { id: true, code: true, label: true, ordinal: true },
              },
            },
          },
          courses: {
            where: { status: 'ACTIVE' },
            orderBy: { code: 'asc' },
            select: {
              id: true,
              code: true,
              title: true,
              creditUnits: true,
              offerings: {
                select: {
                  academicSession: { select: { label: true } },
                  semester: {
                    select: {
                      label: true,
                      programmeLevel: { select: { code: true, label: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}
