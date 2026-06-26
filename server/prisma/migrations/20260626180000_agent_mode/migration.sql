-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "conversationMode" TEXT NOT NULL DEFAULT 'flow';
ALTER TABLE "AppSettings" ADD COLUMN "agentConfigJson" TEXT;

-- AlterTable
ALTER TABLE "Call" ADD COLUMN "conversationMode" TEXT NOT NULL DEFAULT 'flow';

-- CreateTable
CREATE TABLE "AgentResponseExample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerText" TEXT NOT NULL,
    "aiResponseBad" TEXT,
    "correctedText" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "callId" TEXT,
    "segmentId" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AgentResponseExample_approved_idx" ON "AgentResponseExample"("approved");
