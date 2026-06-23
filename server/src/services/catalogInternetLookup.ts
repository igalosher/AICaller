import { getYesCatalog } from "./yesCatalogService.js";

export interface InternetSpeedOption {
  name: string;
  downloadMbps: number;
  uploadMbps: number;
  priceMonthly: number;
}

export interface RouterRentalOption {
  name: string;
  priceMonthly: number;
}

const DEFAULT_ROUTER_RENTAL_HE =
  "שכירות נתב סיבים yes+FIBER: 20 ש״ח לחודש. נתב yesULTRA FIBER: 29.9 ש״ח לחודש.";

function getInternetSection(catalog: Record<string, unknown> | null | undefined) {
  return catalog?.אינטרנט as Record<string, unknown> | undefined;
}

export async function listCatalogInternetTiers(): Promise<InternetSpeedOption[]> {
  const row = await getYesCatalog();
  const internet = getInternetSection(row?.catalog as Record<string, unknown> | null);
  const speeds = internet?.אפשרויות_מהירות;
  if (!Array.isArray(speeds)) return [];
  return speeds.map((s: Record<string, number | string>) => ({
    name: String(s.שם ?? ""),
    downloadMbps: Number(s.הורדה_מקסימלית_מגה ?? 0),
    uploadMbps: Number(s.העלאה_מקסימלית_מגה ?? 0),
    priceMonthly: Number(s.מחיר_חודשי ?? 0),
  }));
}

export async function describeCatalogInternet(name: string): Promise<InternetSpeedOption | null> {
  const tiers = await listCatalogInternetTiers();
  const norm = name.toLowerCase();
  return (
    tiers.find((t) => t.name.toLowerCase().includes(norm) || norm.includes(t.name.toLowerCase())) ??
    null
  );
}

export async function routerRentalInfo(): Promise<{ summaryHe: string; options: RouterRentalOption[] }> {
  const row = await getYesCatalog();
  const internet = getInternetSection(row?.catalog as Record<string, unknown> | null);
  const rentals = internet?.ציוד_בשכירות;
  if (!Array.isArray(rentals) || rentals.length === 0) {
    return { summaryHe: DEFAULT_ROUTER_RENTAL_HE, options: [] };
  }
  const options: RouterRentalOption[] = rentals
    .filter((r: Record<string, unknown>) => String(r.שם ?? "").includes("נתב"))
    .map((r: Record<string, unknown>) => ({
      name: String(r.שם ?? ""),
      priceMonthly: Number(r.מחיר_חודשי ?? 0),
    }));
  const summaryHe =
    options.length > 0
      ? options.map((o) => `${o.name}: ${o.priceMonthly} ש״ח לחודש`).join(". ")
      : DEFAULT_ROUTER_RENTAL_HE;
  return { summaryHe, options };
}
