ALTER TABLE "Course"
ADD COLUMN "isGeneralEngineering" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the existing GET course sharing rule for current catalogue codes,
-- while matching a whole course-code segment instead of any substring.
UPDATE "Course"
SET "isGeneralEngineering" = true
WHERE upper("code") ~ '(^|-)GET[0-9]+';
