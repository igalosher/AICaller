-- CreateTable
CREATE TABLE "AgentConfigVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionNumber" INTEGER NOT NULL,
    "configJson" TEXT NOT NULL,
    "label" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AgentInstructionDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "kind" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "callId" TEXT,
    "segmentId" TEXT,
    "operatorNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfigVersion_versionNumber_key" ON "AgentConfigVersion"("versionNumber");

-- CreateIndex
CREATE INDEX "AgentConfigVersion_createdAt_idx" ON "AgentConfigVersion"("createdAt");

-- CreateIndex
CREATE INDEX "AgentInstructionDraft_status_idx" ON "AgentInstructionDraft"("status");

-- CreateIndex
CREATE INDEX "AgentInstructionDraft_createdAt_idx" ON "AgentInstructionDraft"("createdAt");
