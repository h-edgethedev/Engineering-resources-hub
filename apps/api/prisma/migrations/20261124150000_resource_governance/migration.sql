CREATE TYPE "DeletionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "DeletionReasonCategory" AS ENUM ('DUPLICATE', 'INCORRECT_CLASSIFICATION', 'WRONG_COURSE', 'OUTDATED_MISLEADING', 'CORRUPTED_FILE', 'COPYRIGHT', 'PRIVACY', 'INAPPROPRIATE', 'OTHER');
CREATE TYPE "ResourceTrashMethod" AS ENUM ('SUPER_ADMIN_DIRECT', 'APPROVED_REQUEST');
CREATE TYPE "PurgeJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY', 'COMPLETE', 'CANCELLED');
CREATE TYPE "ResourceReportCategory" AS ENUM ('BROKEN_FILE', 'WRONG_CONTENT', 'COPYRIGHT', 'PRIVACY', 'INAPPROPRIATE', 'OTHER');
CREATE TYPE "ResourceReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

ALTER TABLE "Resource"
  ADD COLUMN "sourceAttribution" TEXT,
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "trashedAt" TIMESTAMP(3),
  ADD COLUMN "trashExpiresAt" TIMESTAMP(3),
  ADD COLUMN "trashGeneration" UUID,
  ADD COLUMN "trashedById" UUID,
  ADD COLUMN "trashReason" TEXT,
  ADD COLUMN "trashMethod" "ResourceTrashMethod",
  ADD COLUMN "statusBeforeTrash" "ResourceApprovalStatus",
  ADD COLUMN "quarantinedAt" TIMESTAMP(3),
  ADD COLUMN "quarantinedById" UUID,
  ADD COLUMN "quarantineReason" TEXT;
CREATE INDEX "Resource_trashedAt_trashExpiresAt_idx" ON "Resource"("trashedAt", "trashExpiresAt");
CREATE INDEX "Resource_quarantinedAt_idx" ON "Resource"("quarantinedAt");

ALTER TABLE "ModerationAction" ALTER COLUMN "resourceId" DROP NOT NULL;
ALTER TABLE "ModerationAction" ADD COLUMN "resourceIdSnapshot" UUID;
UPDATE "ModerationAction" SET "resourceIdSnapshot" = "resourceId";
ALTER TABLE "ModerationAction" ALTER COLUMN "resourceIdSnapshot" SET NOT NULL;
ALTER TABLE "ModerationAction" DROP CONSTRAINT "ModerationAction_resourceId_fkey";
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ModerationAction_resourceIdSnapshot_createdAt_idx" ON "ModerationAction"("resourceIdSnapshot", "createdAt");

CREATE TABLE "DeletionRequest" (
  "id" UUID NOT NULL,
  "resourceId" UUID,
  "resourceIdSnapshot" UUID NOT NULL,
  "universityIdSnapshot" UUID NOT NULL,
  "requestedById" UUID NOT NULL,
  "requestedByRole" TEXT NOT NULL,
  "category" "DeletionReasonCategory" NOT NULL,
  "explanation" TEXT NOT NULL,
  "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
  "decidedById" UUID,
  "decidedByRole" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeletionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeletionRequest_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "DeletionRequest_status_createdAt_idx" ON "DeletionRequest"("status", "createdAt");
CREATE INDEX "DeletionRequest_resourceId_status_idx" ON "DeletionRequest"("resourceId", "status");
CREATE INDEX "DeletionRequest_resourceIdSnapshot_createdAt_idx" ON "DeletionRequest"("resourceIdSnapshot", "createdAt");
CREATE INDEX "DeletionRequest_requestedById_createdAt_idx" ON "DeletionRequest"("requestedById", "createdAt");
CREATE INDEX "DeletionRequest_universityIdSnapshot_status_createdAt_idx" ON "DeletionRequest"("universityIdSnapshot", "status", "createdAt");
CREATE UNIQUE INDEX "DeletionRequest_one_pending_per_resource_key" ON "DeletionRequest"("resourceId") WHERE "status" = 'PENDING' AND "resourceId" IS NOT NULL;

CREATE TABLE "ResourceGovernanceEvent" (
  "id" UUID NOT NULL,
  "resourceId" UUID,
  "resourceIdSnapshot" UUID NOT NULL,
  "trashGenerationSnapshot" UUID NOT NULL,
  "actorId" UUID,
  "actorRole" TEXT,
  "action" TEXT NOT NULL,
  "fieldName" TEXT,
  "previousValue" JSONB,
  "newValue" JSONB,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResourceGovernanceEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResourceGovernanceEvent_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ResourceGovernanceEvent_resourceIdSnapshot_createdAt_idx" ON "ResourceGovernanceEvent"("resourceIdSnapshot", "createdAt");
CREATE INDEX "ResourceGovernanceEvent_actorId_createdAt_idx" ON "ResourceGovernanceEvent"("actorId", "createdAt");

CREATE TABLE "ResourcePurgeJob" (
  "id" UUID NOT NULL,
  "resourceIdSnapshot" UUID NOT NULL,
  "trashGenerationSnapshot" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "status" "PurgeJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResourcePurgeJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ResourcePurgeJob_trashGenerationSnapshot_key" ON "ResourcePurgeJob"("trashGenerationSnapshot");
CREATE INDEX "ResourcePurgeJob_status_createdAt_idx" ON "ResourcePurgeJob"("status", "createdAt");
CREATE INDEX "ResourcePurgeJob_resourceIdSnapshot_status_idx" ON "ResourcePurgeJob"("resourceIdSnapshot", "status");

CREATE TABLE "ResourceReport" (
  "id" UUID NOT NULL,
  "resourceId" UUID,
  "resourceIdSnapshot" UUID NOT NULL,
  "universityIdSnapshot" UUID NOT NULL,
  "reporterId" UUID NOT NULL,
  "reporterRole" TEXT NOT NULL,
  "category" "ResourceReportCategory" NOT NULL,
  "explanation" TEXT NOT NULL,
  "status" "ResourceReportStatus" NOT NULL DEFAULT 'OPEN',
  "reviewedById" UUID,
  "reviewedByRole" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResourceReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResourceReport_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ResourceReport_status_createdAt_idx" ON "ResourceReport"("status", "createdAt");
CREATE INDEX "ResourceReport_resourceIdSnapshot_createdAt_idx" ON "ResourceReport"("resourceIdSnapshot", "createdAt");
CREATE INDEX "ResourceReport_universityIdSnapshot_status_createdAt_idx" ON "ResourceReport"("universityIdSnapshot", "status", "createdAt");
CREATE INDEX "ResourceReport_reporterId_createdAt_idx" ON "ResourceReport"("reporterId", "createdAt");
CREATE UNIQUE INDEX "ResourceReport_one_open_per_reporter_key" ON "ResourceReport"("resourceId", "reporterId") WHERE "status" = 'OPEN' AND "resourceId" IS NOT NULL;
