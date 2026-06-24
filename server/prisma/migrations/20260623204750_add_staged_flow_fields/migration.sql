-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Call" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contactId" TEXT NOT NULL,
    "flowVersionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'dialing',
    "outcome" TEXT NOT NULL DEFAULT 'none',
    "externalCallId" TEXT,
    "currentStage" TEXT,
    "currentSubflowId" TEXT,
    "currentNodeId" TEXT,
    "contextJson" TEXT NOT NULL DEFAULT '{}',
    "summary" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "durationSec" INTEGER,
    CONSTRAINT "Call_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Call_flowVersionId_fkey" FOREIGN KEY ("flowVersionId") REFERENCES "CallFlow" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Call" ("contactId", "currentNodeId", "currentStage", "durationSec", "endedAt", "externalCallId", "flowVersionId", "id", "outcome", "startedAt", "status", "summary") SELECT "contactId", "currentNodeId", "currentStage", "durationSec", "endedAt", "externalCallId", "flowVersionId", "id", "outcome", "startedAt", "status", "summary" FROM "Call";
DROP TABLE "Call";
ALTER TABLE "new_Call" RENAME TO "Call";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
