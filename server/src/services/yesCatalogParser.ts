// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type YesCatalogJson = Record<string, any>;

function flattenChannels(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.values(obj).flatMap((v) => flattenChannels(v));
  }
  return [String(value)];
}

function extractPrice(item: Record<string, unknown>): number | null {
  if (typeof item.מחיר_חודשי === "number") return item.מחיר_חודשי;
  if (typeof item.מחיר === "number") return item.מחיר;
  const promo = item.מבצע_נוכחי_שנמצא as Record<string, unknown> | undefined;
  if (promo && typeof promo.מחיר === "number") return promo.מחיר;
  return null;
}

function describeItem(item: Record<string, unknown>): string {
  const parts: string[] = [];
  if (item.תיאור) parts.push(String(item.תיאור));
  if (item.סוג) parts.push(String(item.סוג));
  if (item.כולל) parts.push(`כולל: ${(item.כולל as string[]).join(", ")}`);
  if (item.הטבות) parts.push(`הטבות: ${(item.הטבות as string[]).join(", ")}`);
  if (item.הערה) parts.push(String(item.הערה));
  return parts.join(" · ") || "חבילת yes";
}

export interface CatalogImportSummary {
  channelPackages: number;
  salesPackets: number;
  internetTiers: number;
  scannedAt: string | null;
}

export function parseYesCatalogForDb(catalog: YesCatalogJson) {
  const tv = catalog.טלוויזיה ?? {};
  const internet = catalog.אינטרנט ?? {};

  const channelPackages: {
    nameHe: string;
    channels: string[];
    priceAddon: number;
  }[] = [];

  const salesPackets: {
    nameHe: string;
    descriptionHe: string;
    priceMonthly: number;
    contractMonths: number;
  }[] = [];

  const internetTiers: {
    nameHe: string;
    downloadMbps: number;
    uploadMbps: number;
    priceMonthly: number;
  }[] = [];

  for (const item of tv.מוצרי_בסיס_ומסלולים ?? []) {
    const price = extractPrice(item);
    if (price === null) continue;
    const channels = flattenChannels(item.ערוצים);
    if (channels.length) {
      channelPackages.push({
        nameHe: String(item.שם),
        channels,
        priceAddon: 0,
      });
    }
    salesPackets.push({
      nameHe: String(item.שם),
      descriptionHe: describeItem(item),
      priceMonthly: price,
      contractMonths: 12,
    });
  }

  for (const item of tv.חבילות_ערוצים_בתשלום ?? []) {
    channelPackages.push({
      nameHe: String(item.שם),
      channels: flattenChannels(item.ערוצים ?? item.כוללת),
      priceAddon: extractPrice(item) ?? 0,
    });
  }

  for (const item of tv.ערוצים_בודדים_בתשלום ?? []) {
    channelPackages.push({
      nameHe: String(item.שם),
      channels: [String(item.שם)],
      priceAddon: extractPrice(item) ?? 0,
    });
  }

  for (const item of tv.ספריות_VOD_בתשלום ?? []) {
    const price = extractPrice(item);
    if (price === null) continue;
    salesPackets.push({
      nameHe: `ספריית ${item.שם}`,
      descriptionHe: "ספריית VOD בתשלום",
      priceMonthly: price,
      contractMonths: 1,
    });
  }

  for (const item of internet.אפשרויות_מהירות ?? []) {
    internetTiers.push({
      nameHe: String(item.שם),
      downloadMbps: Number(item.הורדה_מקסימלית_מגה ?? 0),
      uploadMbps: Number(item.העלאה_מקסימלית_מגה ?? 0),
      priceMonthly: extractPrice(item) ?? 0,
    });
  }

  for (const bundle of catalog.טריפל_ובנדלים ?? []) {
    const price = extractPrice(bundle);
    salesPackets.push({
      nameHe: String(bundle.שם),
      descriptionHe: describeItem(bundle),
      priceMonthly: price ?? 0,
      contractMonths: 12,
    });
  }

  for (const promo of catalog.מבצעים_שמופיעים_באתר ?? []) {
    const price = extractPrice(promo);
    if (price === null) continue;
    salesPackets.push({
      nameHe: `מבצע: ${promo.שם}`,
      descriptionHe: describeItem(promo),
      priceMonthly: price,
      contractMonths: 12,
    });
  }

  return {
    channelPackages,
    salesPackets,
    internetTiers,
    scannedAt: (catalog.תאריך_סריקה as string) ?? null,
  };
}

export function buildCatalogSummary(catalog: YesCatalogJson): CatalogImportSummary {
  const parsed = parseYesCatalogForDb(catalog);
  return {
    channelPackages: parsed.channelPackages.length,
    salesPackets: parsed.salesPackets.length,
    internetTiers: parsed.internetTiers.length,
    scannedAt: parsed.scannedAt,
  };
}
