-- AlterTable
ALTER TABLE "Call" ADD COLUMN "currentNodeId" TEXT;

-- CreateTable
CREATE TABLE "Intent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "labelHe" TEXT NOT NULL,
    "descriptionHe" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'general',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "confidenceThreshold" REAL NOT NULL DEFAULT 0.7,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IntentExample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intentId" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntentExample_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "Intent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UtteranceClassification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "segmentId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "entitiesJson" TEXT NOT NULL DEFAULT '{}',
    "classifier" TEXT NOT NULL,
    "debugJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UtteranceClassification_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "CallTranscriptSegment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UtteranceClassification_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "Intent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CallFlow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 1,
    "openingTemplate" TEXT NOT NULL,
    "stagesJson" TEXT NOT NULL,
    "objectionsJson" TEXT NOT NULL DEFAULT '{}',
    "draftGraphJson" TEXT NOT NULL DEFAULT '{}',
    "publishedGraphJson" TEXT NOT NULL DEFAULT '{}',
    "graphPublishedAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_CallFlow" ("createdAt", "id", "isActive", "objectionsJson", "openingTemplate", "stagesJson", "version") SELECT "createdAt", "id", "isActive", "objectionsJson", "openingTemplate", "stagesJson", "version" FROM "CallFlow";
DROP TABLE "CallFlow";
ALTER TABLE "new_CallFlow" RENAME TO "CallFlow";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "IntentExample_intentId_idx" ON "IntentExample"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "UtteranceClassification_segmentId_key" ON "UtteranceClassification"("segmentId");

-- CreateIndex
CREATE INDEX "UtteranceClassification_callId_idx" ON "UtteranceClassification"("callId");

-- CreateIndex
CREATE INDEX "UtteranceClassification_intentId_idx" ON "UtteranceClassification"("intentId");
