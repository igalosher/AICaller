import { prisma } from "../db.js";
import { AppError } from "../middleware/errorHandler.js";
import { refreshProductKnowledge } from "./productKnowledge.js";
import {
  buildCatalogSummary,
  parseYesCatalogForDb,
  type CatalogImportSummary,
  type YesCatalogJson,
} from "./yesCatalogParser.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG_PATH = path.join(__dirname, "../../data/yes-catalog.json");

export async function getYesCatalog() {
  const row = await prisma.yesCatalog.findUnique({ where: { id: "default" } });
  if (!row) return null;
  return {
    catalog: JSON.parse(row.catalogJson) as YesCatalogJson,
    scannedAt: row.scannedAt,
    importedAt: row.importedAt,
    summary: buildCatalogSummary(JSON.parse(row.catalogJson) as YesCatalogJson),
  };
}

export async function importYesCatalog(
  catalog: YesCatalogJson,
): Promise<CatalogImportSummary> {
  if (!catalog || typeof catalog !== "object") {
    throw new AppError(400, "קטלוג JSON לא תקין");
  }

  const parsed = parseYesCatalogForDb(catalog);

  await prisma.$transaction([
    prisma.channelPackage.deleteMany(),
    prisma.salesPacket.deleteMany(),
    prisma.internetTier.deleteMany(),
    prisma.phonePlan.deleteMany(),
  ]);

  for (const ch of parsed.channelPackages) {
    await prisma.channelPackage.create({
      data: {
        nameHe: ch.nameHe,
        channels: JSON.stringify(ch.channels),
        priceAddon: ch.priceAddon,
        active: true,
      },
    });
  }

  for (const tier of parsed.internetTiers) {
    await prisma.internetTier.create({
      data: {
        nameHe: tier.nameHe,
        downloadMbps: tier.downloadMbps,
        uploadMbps: tier.uploadMbps,
        priceMonthly: tier.priceMonthly,
        active: true,
      },
    });
  }

  for (const packet of parsed.salesPackets) {
    await prisma.salesPacket.create({
      data: {
        nameHe: packet.nameHe,
        descriptionHe: packet.descriptionHe,
        priceMonthly: packet.priceMonthly,
        contractMonths: packet.contractMonths,
        active: true,
      },
    });
  }

  await prisma.yesCatalog.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      catalogJson: JSON.stringify(catalog),
      scannedAt: parsed.scannedAt,
    },
    update: {
      catalogJson: JSON.stringify(catalog),
      scannedAt: parsed.scannedAt,
      importedAt: new Date(),
    },
  });

  await refreshProductKnowledge();
  return buildCatalogSummary(catalog);
}

export async function loadDefaultYesCatalog(): Promise<CatalogImportSummary> {
  const raw = await readFile(DEFAULT_CATALOG_PATH, "utf-8");
  const catalog = JSON.parse(raw) as YesCatalogJson;
  return importYesCatalog(catalog);
}

export async function ensureYesCatalogSeeded(): Promise<void> {
  const existing = await prisma.yesCatalog.findUnique({ where: { id: "default" } });
  if (existing) return;
  try {
    await loadDefaultYesCatalog();
  } catch {
    // default file may be missing on first clone
  }
}
