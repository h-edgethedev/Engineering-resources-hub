import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

interface CourseImportRow {
  target_department: string;
  source_department: string;
  programme: string;
  academic_session: string;
  semester: string;
  course_code: string;
  course_title: string;
  credit_units: string;
  source_pdf: string;
  owner_scope_status: string;
}

const levelBySession = {
  '2024/2025': { code: '100', label: '100 Level', ordinal: 1 },
  '2025/2026': { code: '200', label: '200 Level', ordinal: 2 },
} as const;
const programmeLevelDefinitions = [
  ...Object.values(levelBySession),
  { code: '300', label: '300 Level', ordinal: 3 },
];

const semesterByName = {
  First: { code: 'first', label: 'First Semester', ordinal: 1 },
  Second: { code: 'second', label: 'Second Semester', ordinal: 2 },
} as const;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the academic structure.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += character;
    }
  }

  cells.push(cell);
  return cells;
}

async function loadCourseImport(): Promise<CourseImportRow[]> {
  const csvUrl = new URL('../../../docs/COMPUTER_ENGINEERING_COURSE_REVIEW.csv', import.meta.url);
  const csv = await readFile(csvUrl, 'utf8');
  const [headerLine, ...dataLines] = csv.trim().split(/\r?\n/);
  if (!headerLine) throw new Error('Computer Engineering course import CSV is empty.');

  const headers = parseCsvLine(headerLine);
  return dataLines.filter(Boolean).map((line, lineIndex) => {
    const values = parseCsvLine(line);
    if (values.length !== headers.length) {
      throw new Error(`Invalid course import CSV at data row ${lineIndex + 1}.`);
    }
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]])) as Record<string, string>;
    return {
      target_department: row.target_department ?? '',
      source_department: row.source_department ?? '',
      programme: row.programme ?? '',
      academic_session: row.academic_session ?? '',
      semester: row.semester ?? '',
      course_code: row.course_code ?? '',
      course_title: row.course_title ?? '',
      credit_units: row.credit_units ?? '',
      source_pdf: row.source_pdf ?? '',
      owner_scope_status: row.owner_scope_status ?? '',
    };
  });
}

function validateCourseImport(rows: CourseImportRow[]) {
  if (rows.length !== 36) {
    throw new Error(`Expected 36 Computer Engineering course offerings, found ${rows.length}.`);
  }

  const coursesByCode = new Map<string, { title: string; creditUnits: number }>();
  for (const row of rows) {
    if (row.target_department !== 'Computer Engineering' || row.programme !== 'Bachelor of Science in Computer Engineering') {
      throw new Error(`Unexpected department or programme for ${row.course_code}.`);
    }
    if (!row.owner_scope_status.startsWith('Owner confirmed')) {
      throw new Error(`Course import scope is not owner-confirmed for ${row.course_code}.`);
    }
    if (!levelBySession[row.academic_session as keyof typeof levelBySession] || !semesterByName[row.semester as keyof typeof semesterByName]) {
      throw new Error(`Unsupported session or semester for ${row.course_code}.`);
    }

    const creditUnits = Number(row.credit_units);
    if (!row.course_code || !row.course_title || !Number.isInteger(creditUnits) || creditUnits < 1) {
      throw new Error(`Invalid course code, title or credit units in course import.`);
    }

    const existingCourse = coursesByCode.get(row.course_code);
    if (existingCourse && (existingCourse.title !== row.course_title || existingCourse.creditUnits !== creditUnits)) {
      throw new Error(`Conflicting course details for code ${row.course_code}.`);
    }
    coursesByCode.set(row.course_code, { title: row.course_title, creditUnits });
  }
}

async function main() {
  const courseRows = await loadCourseImport();
  validateCourseImport(courseRows);

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
  const departmentBySlug = new Map<string, { id: string; name: string }>();

  for (const department of departments) {
    const savedDepartment = await prisma.department.upsert({
      where: {
        facultyId_slug: {
          facultyId: faculty.id,
          slug: department.slug,
        },
      },
      update: { name: department.name },
      create: { ...department, facultyId: faculty.id },
    });
    departmentBySlug.set(department.slug, savedDepartment);
  }

  const computerEngineeringDepartment = departmentBySlug.get('computer-engineering');
  if (!computerEngineeringDepartment) throw new Error('Computer Engineering department was not seeded.');

  const programme = await prisma.programme.upsert({
    where: {
      departmentId_slug: {
        departmentId: computerEngineeringDepartment.id,
        slug: 'bachelor-of-science-in-computer-engineering',
      },
    },
    update: { name: 'Bachelor of Science in Computer Engineering', award: 'Bachelor of Science' },
    create: {
      departmentId: computerEngineeringDepartment.id,
      name: 'Bachelor of Science in Computer Engineering',
      slug: 'bachelor-of-science-in-computer-engineering',
      award: 'Bachelor of Science',
    },
  });

  const levels = new Map<string, { id: string; code: string }>();
  for (const level of programmeLevelDefinitions) {
    const savedLevel = await prisma.programmeLevel.upsert({
      where: { programmeId_code: { programmeId: programme.id, code: level.code } },
      update: { label: level.label, ordinal: level.ordinal },
      create: { ...level, programmeId: programme.id },
    });
    levels.set(level.code, savedLevel);
  }

  const semesters = new Map<string, { id: string; label: string }>();
  for (const level of levels.values()) {
    for (const semester of Object.values(semesterByName)) {
      const savedSemester = await prisma.semester.upsert({
        where: {
          programmeLevelId_code: {
            programmeLevelId: level.id,
            code: semester.code,
          },
        },
        update: { label: semester.label, ordinal: semester.ordinal },
        create: { ...semester, programmeLevelId: level.id },
      });
      semesters.set(`${level.code}:${semester.code}`, savedSemester);
    }
  }

  const sessions = new Map<string, { id: string }>();
  for (const sessionLabel of Object.keys(levelBySession)) {
    const session = await prisma.academicSession.upsert({
      where: { universityId_label: { universityId: university.id, label: sessionLabel } },
      update: {},
      create: { universityId: university.id, label: sessionLabel },
    });
    sessions.set(sessionLabel, session);
    await prisma.programmeSession.upsert({
      where: { programmeId_academicSessionId: { programmeId: programme.id, academicSessionId: session.id } },
      update: {},
      create: { programmeId: programme.id, academicSessionId: session.id },
    });
  }

  const electricalDepartment = departmentBySlug.get('electrical-and-electronics-engineering');
  if (!electricalDepartment) throw new Error('Electrical and Electronics Engineering department was not seeded.');
  const electricalProgramme = await prisma.programme.upsert({
    where: {
      departmentId_slug: {
        departmentId: electricalDepartment.id,
        slug: 'bachelor-of-science-in-electrical-and-electronics-engineering',
      },
    },
    update: { name: 'Bachelor of Science in Electrical and Electronics Engineering', award: 'Bachelor of Science' },
    create: {
      departmentId: electricalDepartment.id,
      name: 'Bachelor of Science in Electrical and Electronics Engineering',
      slug: 'bachelor-of-science-in-electrical-and-electronics-engineering',
      award: 'Bachelor of Science',
    },
  });
  for (const level of programmeLevelDefinitions) {
    const savedLevel = await prisma.programmeLevel.upsert({
      where: { programmeId_code: { programmeId: electricalProgramme.id, code: level.code } },
      update: { label: level.label, ordinal: level.ordinal },
      create: { ...level, programmeId: electricalProgramme.id },
    });
    for (const semester of Object.values(semesterByName)) {
      await prisma.semester.upsert({
        where: { programmeLevelId_code: { programmeLevelId: savedLevel.id, code: semester.code } },
        update: { label: semester.label, ordinal: semester.ordinal },
        create: { ...semester, programmeLevelId: savedLevel.id },
      });
    }
  }

  const coursesByCode = new Map<string, { title: string; creditUnits: number }>();
  let offeringCount = 0;

  for (const row of courseRows) {
    if (row.target_department !== 'Computer Engineering') {
      throw new Error(`Unexpected target department for ${row.course_code}: ${row.target_department}`);
    }
    if (row.programme !== programme.name) {
      throw new Error(`Unexpected programme for ${row.course_code}: ${row.programme}`);
    }

    const levelDefinition = levelBySession[row.academic_session as keyof typeof levelBySession];
    const semesterDefinition = semesterByName[row.semester as keyof typeof semesterByName];
    const level = levelDefinition && levels.get(levelDefinition.code);
    const semester = level && semesterDefinition && semesters.get(`${level.code}:${semesterDefinition.code}`);
    const session = sessions.get(row.academic_session);
    const creditUnits = Number(row.credit_units);
    if (!level || !semester || !session || !Number.isInteger(creditUnits) || creditUnits < 1) {
      throw new Error(`Invalid session, semester or credit units for ${row.course_code}.`);
    }

    const knownCourse = coursesByCode.get(row.course_code);
    if (knownCourse && (knownCourse.title !== row.course_title || knownCourse.creditUnits !== creditUnits)) {
      throw new Error(`Conflicting course details for code ${row.course_code}.`);
    }
    coursesByCode.set(row.course_code, { title: row.course_title, creditUnits });

    const course = await prisma.course.upsert({
      where: { programmeId_code: { programmeId: programme.id, code: row.course_code } },
      update: { title: row.course_title, creditUnits },
      create: {
        programmeId: programme.id,
        code: row.course_code,
        title: row.course_title,
        creditUnits,
      },
    });

    await prisma.courseOffering.upsert({
      where: {
        courseId_semesterId_academicSessionId: {
          courseId: course.id,
          semesterId: semester.id,
          academicSessionId: session.id,
        },
      },
      update: {},
      create: {
        courseId: course.id,
        semesterId: semester.id,
        academicSessionId: session.id,
      },
    });
    offeringCount += 1;
  }

  console.info(
    `Seeded ${university.name} / ${faculty.name} / ${departments.length} departments / ${programme.name}: ${coursesByCode.size} courses and ${offeringCount} course offerings.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Academic structure seed failed.', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
