import { prisma } from "../db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { YesCatalogJson } from "./yesCatalogParser.js";
import { getYesCatalog } from "./yesCatalogService.js";

export interface CatalogChannel {
  id: string;
  name: string;
  description?: string;
  category?: string;
  packets: string[];
}

function normalizeHebrew(text: string): string {
  return text
    .toLowerCase()
    .replace(/['"׳״]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function channelList(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

function collectAllChannels(catalog: YesCatalogJson): CatalogChannel[] {
  const map = new Map<string, CatalogChannel>();
  const tv = catalog.טלוויזיה;

  const addChannel = (name: string, packetName: string, description?: string, category?: string) => {
    const key = normalizeHebrew(name);
    const existing = map.get(key);
    if (existing) {
      if (!existing.packets.includes(packetName)) existing.packets.push(packetName);
      return;
    }
    map.set(key, {
      id: key,
      name,
      description,
      category,
      packets: [packetName],
    });
  };

  const baseProducts = Array.isArray(tv?.מוצרי_בסיס_ומסלולים)
    ? tv!.מוצרי_בסיס_ומסלולים
    : [];
  for (const p of baseProducts) {
    for (const ch of channelList(p.ערוצים)) {
      addChannel(ch, p.שם ?? "מוצר", p.תיאור, "בסיס");
    }
  }

  const paid = Array.isArray(tv?.חבילות_ערוצים_בתשלום) ? tv!.חבילות_ערוצים_בתשלום : [];
  for (const pkg of paid) {
    for (const ch of channelList(pkg.ערוצים)) {
      addChannel(ch, pkg.שם ?? "חבילת ערוצים", pkg.תיאור, "תשלום");
    }
  }

  const bundles = Array.isArray(catalog.טריפל_ובנדלים) ? catalog.טריפל_ובנדלים : [];
  for (const b of bundles) {
    for (const ch of channelList(b.ערוצים)) {
      addChannel(ch, b.שם ?? "בנדל", b.תיאור, "בנדל");
    }
  }

  return [...map.values()];
}

let channelCache: CatalogChannel[] | null = null;

async function loadChannels(): Promise<CatalogChannel[]> {
  if (channelCache) return channelCache;
  const row = await getYesCatalog();
  if (!row?.catalog) {
    channelCache = [];
    return channelCache;
  }
  channelCache = collectAllChannels(row.catalog);
  return channelCache;
}

export function clearChannelCache(): void {
  channelCache = null;
}

function scoreMatch(query: string, candidate: string): number {
  const q = normalizeHebrew(query);
  const c = normalizeHebrew(candidate);
  if (!q || !c) return 0;
  if (c === q) return 1;
  if (c.includes(q) || q.includes(c)) return 0.85;
  const qWords = q.split(" ");
  const matched = qWords.filter((w) => w.length > 2 && c.includes(w)).length;
  return matched / Math.max(qWords.length, 1);
}

export async function listCatalogChannels(): Promise<CatalogChannel[]> {
  return loadChannels();
}

export async function findChannelByName(
  name: string,
): Promise<{ channel: CatalogChannel; confidence: number } | null> {
  const channels = await loadChannels();
  let best: { channel: CatalogChannel; confidence: number } | null = null;
  for (const ch of channels) {
    const score = scoreMatch(name, ch.name);
    if (!best || score > best.confidence) {
      best = { channel: ch, confidence: score };
    }
  }
  return best && best.confidence >= 0.5 ? best : null;
}

export async function fuzzyMatchChannel(
  utterance: string,
): Promise<{ channel: CatalogChannel; confidence: number } | null> {
  const channels = await loadChannels();
  let best: { channel: CatalogChannel; confidence: number } | null = null;
  for (const ch of channels) {
    const score = scoreMatch(utterance, ch.name);
    if (!best || score > best.confidence) {
      best = { channel: ch, confidence: score };
    }
  }
  return best && best.confidence >= 0.4 ? best : null;
}

export async function describeChannel(nameOrId: string): Promise<CatalogChannel | null> {
  const hit = await findChannelByName(nameOrId);
  return hit?.channel ?? null;
}

export async function channelsInPacket(packetName: string): Promise<string[]> {
  const channels = await loadChannels();
  const norm = normalizeHebrew(packetName);
  const names = new Set<string>();
  for (const ch of channels) {
    if (ch.packets.some((p) => normalizeHebrew(p).includes(norm) || norm.includes(normalizeHebrew(p)))) {
      names.add(ch.name);
    }
  }
  return [...names];
}

export async function getChannelById(id: string): Promise<CatalogChannel | null> {
  const channels = await loadChannels();
  return channels.find((c) => c.id === id) ?? null;
}

export async function extractChannelFromUtterance(
  utterance: string,
): Promise<{ channel: CatalogChannel; confidence: number } | null> {
  return fuzzyMatchChannel(utterance);
}

export async function extractPacketFromUtterance(
  utterance: string,
): Promise<string | null> {
  const row = await getYesCatalog();
  if (!row?.catalog) return null;
  const catalog = row.catalog;
  const names: string[] = [];
  for (const p of catalog.טלוויזיה?.מוצרי_בסיס_ומסלולים ?? []) {
    if (p.שם) names.push(p.שם);
  }
  const bundles = catalog.טריפל_ובנדלים;
  if (Array.isArray(bundles)) {
    for (const p of bundles) {
      if (p.שם) names.push(p.שם);
    }
  }
  const norm = normalizeHebrew(utterance);
  const hit = names.find((n) => norm.includes(normalizeHebrew(n)));
  return hit ?? null;
}
