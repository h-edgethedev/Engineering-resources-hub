/*
  Warnings:

  - You are about to drop the column `trashGenerationSnapshot` on the `ResourceGovernanceEvent` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ResourceGovernanceEvent" DROP COLUMN "trashGenerationSnapshot";
