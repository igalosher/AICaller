-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contactId" TEXT NOT NULL,
    "flowVersionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'dialing',
    "outcome" TEXT NOT NULL DEFAULT 'none',
    "externalCallId" TEXT,
    "currentStage" TEXT,
    "summary" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "durationSec" INTEGER,
    CONSTRAINT "Call_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Call_flowVersionId_fkey" FOREIGN KEY ("flowVersionId") REFERENCES "CallFlow" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CallTranscriptSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callId" TEXT NOT NULL,
    "speaker" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallTranscriptSegment_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesPacket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameHe" TEXT NOT NULL,
    "descriptionHe" TEXT NOT NULL,
    "priceMonthly" REAL NOT NULL,
    "contractMonths" INTEGER NOT NULL DEFAULT 12,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "channelIds" TEXT NOT NULL DEFAULT '[]',
    "internetTierId" TEXT,
    "phonePlanId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChannelPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameHe" TEXT NOT NULL,
    "channels" TEXT NOT NULL DEFAULT '[]',
    "priceAddon" REAL NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InternetTier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameHe" TEXT NOT NULL,
    "downloadMbps" INTEGER NOT NULL,
    "uploadMbps" INTEGER NOT NULL,
    "priceMonthly" REAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PhonePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameHe" TEXT NOT NULL,
    "features" TEXT NOT NULL DEFAULT '[]',
    "priceMonthly" REAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CallFlow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 1,
    "openingTemplate" TEXT NOT NULL,
    "stagesJson" TEXT NOT NULL,
    "objectionsJson" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "telephonyConfig" TEXT,
    "aiConfig" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductKnowledgeIndex" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "dataJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_phone_key" ON "Contact"("phone");
