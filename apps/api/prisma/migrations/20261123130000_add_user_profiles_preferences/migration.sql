CREATE TYPE "PreferredResourceKind" AS ENUM (
  'TEXTBOOK', 'LECTURE_NOTE', 'PAST_QUESTION', 'SLIDES',
  'WORKED_SOLUTION', 'LAB_MANUAL', 'PROGRAMMING_EXERCISE', 'PROJECT'
);
CREATE TYPE "LearningInterest" AS ENUM (
  'PROGRAMMING', 'AI', 'ELECTRONICS', 'TELECOMMUNICATIONS', 'ROBOTICS', 'MATHEMATICS'
);
CREATE TYPE "LearningGoal" AS ENUM (
  'EXAM_PREPARATION', 'CONCEPT_MASTERY', 'PROJECT_BUILDING', 'RESEARCH'
);

CREATE TABLE "UserProfile" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "username" TEXT,
  "avatarUrl" TEXT,
  "bio" TEXT,
  "githubUrl" TEXT,
  "linkedInUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");
CREATE UNIQUE INDEX "UserProfile_username_key" ON "UserProfile"("username");
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserPreferences" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "resourceKinds" "PreferredResourceKind"[] NOT NULL DEFAULT ARRAY[]::"PreferredResourceKind"[],
  "learningInterests" "LearningInterest"[] NOT NULL DEFAULT ARRAY[]::"LearningInterest"[],
  "learningGoals" "LearningGoal"[] NOT NULL DEFAULT ARRAY[]::"LearningGoal"[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
