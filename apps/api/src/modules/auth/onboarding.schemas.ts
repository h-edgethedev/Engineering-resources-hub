import { z } from 'zod';

function secureUrl(value: string, allowedHosts?: string[]) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && !parsed.username
      && !parsed.password
      && (!allowedHosts || allowedHosts.includes(parsed.hostname.toLowerCase()));
  } catch {
    return false;
  }
}

const optionalHttpsUrl = z.string().trim().url().refine((value) => secureUrl(value), 'must be a valid HTTPS URL').nullable();
const githubProfileUrl = z.string().trim().url().refine((value) => secureUrl(value, ['github.com', 'www.github.com']), 'must be a valid HTTPS GitHub profile URL').nullable();
const linkedInProfileUrl = z.string().trim().url().refine((value) => secureUrl(value, ['linkedin.com', 'www.linkedin.com']), 'must be a valid HTTPS LinkedIn profile URL').nullable();

export const userProfileInputSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, 'must be 3–30 characters using letters, numbers, or underscores').nullable(),
  avatarUrl: optionalHttpsUrl,
  bio: z.string().trim().max(280).nullable(),
  githubUrl: githubProfileUrl,
  linkedInUrl: linkedInProfileUrl,
}).strict();

export const userPreferencesInputSchema = z.object({
  resourceKinds: z.array(z.enum(['TEXTBOOK', 'LECTURE_NOTE', 'PAST_QUESTION', 'SLIDES', 'WORKED_SOLUTION', 'LAB_MANUAL', 'PROGRAMMING_EXERCISE', 'PROJECT'])).max(8),
  learningInterests: z.array(z.enum(['PROGRAMMING', 'AI', 'ELECTRONICS', 'TELECOMMUNICATIONS', 'ROBOTICS', 'MATHEMATICS'])).max(6),
  learningGoals: z.array(z.enum(['EXAM_PREPARATION', 'CONCEPT_MASTERY', 'PROJECT_BUILDING', 'RESEARCH'])).max(4),
}).strict().refine((value) => new Set(value.resourceKinds).size === value.resourceKinds.length
  && new Set(value.learningInterests).size === value.learningInterests.length
  && new Set(value.learningGoals).size === value.learningGoals.length, 'preference selections cannot contain duplicates');

export type UserProfileInput = z.infer<typeof userProfileInputSchema>;
export type UserPreferencesInput = z.infer<typeof userPreferencesInputSchema>;
