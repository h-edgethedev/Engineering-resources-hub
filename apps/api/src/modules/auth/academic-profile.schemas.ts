import { z } from 'zod';

export const academicProfileInputSchema = z.object({
  universityId: z.uuid().nullable(),
  facultyId: z.uuid().nullable(),
  departmentId: z.uuid().nullable(),
  programmeId: z.uuid().nullable(),
  currentLevelId: z.uuid().nullable(),
  currentSemesterId: z.uuid().nullable(),
}).strict().superRefine((profile, context) => {
  const requirements: Array<[keyof typeof profile, keyof typeof profile, string]> = [
    ['facultyId', 'universityId', 'A faculty requires a university.'],
    ['departmentId', 'facultyId', 'A department requires a faculty.'],
    ['programmeId', 'departmentId', 'A programme requires a department.'],
    ['currentLevelId', 'programmeId', 'A level requires a programme.'],
    ['currentSemesterId', 'currentLevelId', 'A semester requires a level.'],
  ];
  for (const [child, parent, message] of requirements) {
    if (profile[child] && !profile[parent]) context.addIssue({ code: 'custom', path: [child], message });
  }
});

export type AcademicProfileInput = z.infer<typeof academicProfileInputSchema>;
