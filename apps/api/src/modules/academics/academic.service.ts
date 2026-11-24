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

export async function listFaculties(universitySlug: string) {
  return prisma.faculty.findMany({
    where: { university: { slug: universitySlug, status: 'ACTIVE' } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, _count: { select: { departments: true } } },
  });
}

export async function findFaculty(universitySlug: string, facultySlug: string) {
  return prisma.faculty.findFirst({ where: { slug: facultySlug, university: { slug: universitySlug, status: 'ACTIVE' } }, select: { id: true } });
}

export async function findDepartment(universitySlug: string, facultySlug: string, departmentSlug: string) {
  return prisma.department.findFirst({ where: { slug: departmentSlug, faculty: { slug: facultySlug, university: { slug: universitySlug, status: 'ACTIVE' } } }, select: { id: true } });
}

export async function listDepartments(universitySlug: string, facultySlug: string) {
  return prisma.department.findMany({
    where: { faculty: { slug: facultySlug, university: { slug: universitySlug, status: 'ACTIVE' } } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true },
  });
}

export async function listProgrammesInDepartment(universitySlug: string, facultySlug: string, departmentSlug: string) {
  return prisma.programme.findMany({
    where: { status: 'ACTIVE', department: { slug: departmentSlug, faculty: { slug: facultySlug, university: { slug: universitySlug, status: 'ACTIVE' } } } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, award: true, durationYears: true, levels: { orderBy: { ordinal: 'asc' }, select: { id: true, code: true, label: true, ordinal: true } } },
  });
}

export async function findProgrammeInDepartment(universitySlug: string, facultySlug: string, departmentSlug: string, programmeSlug: string) {
  return prisma.programme.findFirst({
    where: { slug: programmeSlug, status: 'ACTIVE', department: { slug: departmentSlug, faculty: { slug: facultySlug, university: { slug: universitySlug, status: 'ACTIVE' } } } },
    select: {
      id: true, name: true, slug: true, award: true, durationYears: true,
      levels: { orderBy: { ordinal: 'asc' }, select: { id: true, code: true, label: true, ordinal: true, semesters: { orderBy: { ordinal: 'asc' }, select: { id: true, code: true, label: true, ordinal: true } } } },
      courses: { where: { status: 'ACTIVE' }, orderBy: { code: 'asc' }, select: { id: true, code: true, title: true, creditUnits: true } },
    },
  });
}

type CourseFilters = { university?: string; faculty?: string; department?: string; q?: string; level?: string; session?: string; semester?: string; page: number; pageSize: number };

function courseWhere(filters: CourseFilters) {
  const offeringFilters = [
    filters.level ? { semester: { programmeLevel: { code: filters.level } } } : undefined,
    filters.session ? { academicSession: { label: filters.session } } : undefined,
    filters.semester ? { semester: { code: filters.semester } } : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => filter !== undefined);
  return {
    status: 'ACTIVE' as const,
    programme: { status: 'ACTIVE' as const, department: {
      faculty: { ...(filters.faculty ? { slug: filters.faculty } : {}), university: filters.university ? { slug: filters.university, status: 'ACTIVE' as const } : { status: 'ACTIVE' as const } },
    } },
    ...(filters.department ? { OR: [
      { programme: { department: { slug: filters.department } } },
      { code: { contains: 'GET', mode: 'insensitive' as const } },
    ] } : {}),
    ...(filters.q ? { AND: [{ OR: [
      { code: { contains: filters.q, mode: 'insensitive' as const } },
      { title: { contains: filters.q, mode: 'insensitive' as const } },
      { description: { contains: filters.q, mode: 'insensitive' as const } },
    ] }] } : {}),
    ...(offeringFilters.length ? { offerings: { some: { AND: offeringFilters } } } : {}),
  };
}

const courseRelations = {
  programme: { select: { id: true, name: true, slug: true, department: { select: { id: true, name: true, slug: true, faculty: { select: { id: true, name: true, slug: true, university: { select: { id: true, name: true, slug: true } } } } } } } },
  offerings: { select: { academicSession: { select: { id: true, label: true } }, semester: { select: { id: true, code: true, label: true, programmeLevel: { select: { id: true, code: true, label: true } } } } } },
} as const;

export async function listCourses(filters: CourseFilters) {
  const where = courseWhere(filters);
  const [total, items] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({ where, orderBy: [{ code: 'asc' }, { title: 'asc' }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize, select: { id: true, code: true, title: true, description: true, creditUnits: true, ...courseRelations } }),
  ]);
  return { items: items.map((course) => ({ ...course, isGeneralEngineering: course.code.toUpperCase().includes('GET') })), meta: { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) } };
}

export async function findCourseById(courseId: string) {
  const course = await prisma.course.findFirst({ where: { id: courseId, status: 'ACTIVE' }, select: { id: true, code: true, title: true, description: true, creditUnits: true, ...courseRelations } });
  return course ? { ...course, isGeneralEngineering: course.code.toUpperCase().includes('GET') } : null;
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
  const department = await prisma.department.findFirst({
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
  if (!department) return null;

  const generalCourses = await prisma.course.findMany({
    where: {
      status: 'ACTIVE',
      code: { contains: 'GET', mode: 'insensitive' },
      programme: { status: 'ACTIVE', department: { faculty: { university: { slug: universitySlug, status: 'ACTIVE' } } } },
      id: { notIn: department.programmes.flatMap((programme) => programme.courses.map((course) => course.id)) },
    },
    orderBy: [{ code: 'asc' }, { title: 'asc' }],
    select: { id: true, code: true, title: true, description: true, creditUnits: true, ...courseRelations },
  });
  return { ...department, generalCourses: generalCourses.map((course) => ({ ...course, isGeneralEngineering: true })) };
}
