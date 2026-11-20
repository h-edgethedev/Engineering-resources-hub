CREATE TYPE "ResourceType" AS ENUM (
  'LECTURE_NOTE',
  'TEXTBOOK',
  'PAST_QUESTION',
  'SOLUTION',
  'LAB_MANUAL',
  'PROGRAMMING_EXERCISE',
  'OTHER'
);

CREATE TYPE "ResourceApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REMOVED');

CREATE TABLE "Resource" (
  "id" UUID NOT NULL,
  "courseId" UUID NOT NULL,
  "academicSessionId" UUID,
  "semesterId" UUID,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "type" "ResourceType" NOT NULL,
  "status" "ResourceApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResourceFile" (
  "id" UUID NOT NULL,
  "resourceId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResourceFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Resource_courseId_status_createdAt_idx" ON "Resource"("courseId", "status", "createdAt");
CREATE INDEX "Resource_academicSessionId_semesterId_idx" ON "Resource"("academicSessionId", "semesterId");
CREATE INDEX "Resource_type_status_idx" ON "Resource"("type", "status");
CREATE UNIQUE INDEX "ResourceFile_resourceId_key" ON "ResourceFile"("resourceId");
CREATE UNIQUE INDEX "ResourceFile_provider_storageKey_key" ON "ResourceFile"("provider", "storageKey");

ALTER TABLE "Resource" ADD CONSTRAINT "Resource_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_academicSessionId_fkey"
  FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_semesterId_fkey"
  FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceFile" ADD CONSTRAINT "ResourceFile_resourceId_fkey"
  FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
