-- CreateTable
CREATE TABLE "YesCatalog" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "catalogJson" TEXT NOT NULL,
    "scannedAt" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
