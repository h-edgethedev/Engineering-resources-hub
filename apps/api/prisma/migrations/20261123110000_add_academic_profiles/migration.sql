CREATE TABLE "AcademicProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "universityId" UUID,
    "facultyId" UUID,
    "departmentId" UUID,
    "programmeId" UUID,
    "currentLevelId" UUID,
    "currentSemesterId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcademicProfile_userId_key" ON "AcademicProfile"("userId");
CREATE INDEX "AcademicProfile_universityId_idx" ON "AcademicProfile"("universityId");
CREATE INDEX "AcademicProfile_departmentId_idx" ON "AcademicProfile"("departmentId");
CREATE INDEX "AcademicProfile_programmeId_idx" ON "AcademicProfile"("programmeId");

ALTER TABLE "AcademicProfile" ADD CONSTRAINT "AcademicProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademicProfile" ADD CONSTRAINT "AcademicProfile_universityId_fkey"
FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcademicProfile" ADD CONSTRAINT "AcademicProfile_facultyId_fkey"
FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcademicProfile" ADD CONSTRAINT "AcademicProfile_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcademicProfile" ADD CONSTRAINT "AcademicProfile_programmeId_fkey"
FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcademicProfile" ADD CONSTRAINT "AcademicProfile_currentLevelId_fkey"
FOREIGN KEY ("currentLevelId") REFERENCES "ProgrammeLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcademicProfile" ADD CONSTRAINT "AcademicProfile_currentSemesterId_fkey"
FOREIGN KEY ("currentSemesterId") REFERENCES "Semester"("id") ON DELETE SET NULL ON UPDATE CASCADE;
