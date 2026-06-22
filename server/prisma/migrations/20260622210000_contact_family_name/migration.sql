-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "familyName" TEXT NOT NULL DEFAULT '';

-- Backfill familyName from legacy full name + firstName
UPDATE "Contact"
SET "familyName" = trim(
  CASE
    WHEN instr(trim("name"), ' ') > 0 THEN substr(trim("name"), instr(trim("name"), ' ') + 1)
    ELSE ''
  END
)
WHERE "familyName" = '';

UPDATE "Contact"
SET "firstName" = trim(substr(trim("name"), 1, CASE WHEN instr(trim("name"), ' ') > 0 THEN instr(trim("name"), ' ') - 1 ELSE length(trim("name")) END))
WHERE trim("firstName") = '';

-- Redefine tables without legacy name column (SQLite)
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "familyName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Contact" ("id", "firstName", "familyName", "phone", "status", "notes", "deletedAt", "createdAt", "updatedAt")
SELECT "id", "firstName", "familyName", "phone", "status", "notes", "deletedAt", "createdAt", "updatedAt"
FROM "Contact";

DROP TABLE "Contact";
ALTER TABLE "new_Contact" RENAME TO "Contact";
CREATE UNIQUE INDEX "Contact_phone_key" ON "Contact"("phone");

PRAGMA foreign_keys=ON;
