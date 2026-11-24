CREATE TABLE "GovernanceInboxState" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GovernanceInboxState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceInboxState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GovernanceInboxState_userId_key" ON "GovernanceInboxState"("userId");
