import { prisma } from "../db.js";
import { salesService } from "./salesService.js";
import {
  channelsInPacket,
  describeChannel,
  findChannelByName,
  fuzzyMatchChannel,
  listCatalogChannels,
} from "./catalogChannelLookup.js";
import {
  describeCatalogInternet,
  listCatalogInternetTiers,
  routerRentalInfo,
} from "./catalogInternetLookup.js";

export interface KnowledgePacket {
  id: string;
  nameHe: string;
  descriptionHe: string;
  priceMonthly: number;
  contractMonths: number;
  channels: { nameHe: string; channels: string[] }[];
  internetTier?: { nameHe: string; downloadMbps: number; uploadMbps: number };
  phonePlan?: { nameHe: string; features: string[] };
}

export async function refreshProductKnowledge(): Promise<void> {
  const [packets, channels, tiers, plans] = await Promise.all([
    prisma.salesPacket.findMany({ where: { active: true } }),
    prisma.channelPackage.findMany({ where: { active: true } }),
    prisma.internetTier.findMany({ where: { active: true } }),
    prisma.phonePlan.findMany({ where: { active: true } }),
  ]);

  const channelMap = new Map(channels.map((c) => [c.id, c]));
  const tierMap = new Map(tiers.map((t) => [t.id, t]));
  const planMap = new Map(plans.map((p) => [p.id, p]));

  const enriched: KnowledgePacket[] = packets.map((packet) => {
    const channelIds = JSON.parse(packet.channelIds) as string[];
    return {
      id: packet.id,
      nameHe: packet.nameHe,
      descriptionHe: packet.descriptionHe,
      priceMonthly: packet.priceMonthly,
      contractMonths: packet.contractMonths,
      channels: channelIds
        .map((id) => channelMap.get(id))
        .filter(Boolean)
        .map((c) => ({
          nameHe: c!.nameHe,
          channels: JSON.parse(c!.channels) as string[],
        })),
      internetTier: packet.internetTierId
        ? tierMap.get(packet.internetTierId)
          ? {
              nameHe: tierMap.get(packet.internetTierId)!.nameHe,
              downloadMbps: tierMap.get(packet.internetTierId)!.downloadMbps,
              uploadMbps: tierMap.get(packet.internetTierId)!.uploadMbps,
            }
          : undefined
        : undefined,
      phonePlan: packet.phonePlanId
        ? planMap.get(packet.phonePlanId)
          ? {
              nameHe: planMap.get(packet.phonePlanId)!.nameHe,
              features: JSON.parse(planMap.get(packet.phonePlanId)!.features) as string[],
            }
          : undefined
        : undefined,
    };
  });

  const yesRow = await prisma.yesCatalog.findUnique({ where: { id: "default" } });
  const yesCatalog = yesRow ? (JSON.parse(yesRow.catalogJson) as Record<string, unknown>) : null;

  await prisma.productKnowledgeIndex.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      dataJson: JSON.stringify({ packets: enriched, channels, tiers, plans, yesCatalog }),
    },
    update: {
      dataJson: JSON.stringify({ packets: enriched, channels, tiers, plans, yesCatalog }),
    },
  });
}

export async function getKnowledgeIndex() {
  const index = await prisma.productKnowledgeIndex.findUnique({ where: { id: "default" } });
  if (!index) {
    await refreshProductKnowledge();
    return getKnowledgeIndex();
  }
  return JSON.parse(index.dataJson) as {
    packets: KnowledgePacket[];
    channels: Awaited<ReturnType<typeof salesService.listChannels>>;
    tiers: Awaited<ReturnType<typeof salesService.listInternetTiers>>;
    plans: Awaited<ReturnType<typeof salesService.listPhonePlans>>;
    yesCatalog: Record<string, unknown> | null;
  };
}

export const productTools = {
  async list_packets() {
    const { packets } = await getKnowledgeIndex();
    return packets.map((p) => ({
      id: p.id,
      nameHe: p.nameHe,
      priceMonthly: p.priceMonthly,
      contractMonths: p.contractMonths,
    }));
  },
  async lookup_packet(nameOrId: string) {
    const { packets, yesCatalog } = await getKnowledgeIndex();
    const fromDb =
      packets.find((p) => p.id === nameOrId || p.nameHe.includes(nameOrId)) ?? null;
    if (fromDb) return fromDb;
    if (!yesCatalog) return null;
    const tv = yesCatalog.טלוויזיה as Record<string, unknown> | undefined;
    const all = [
      ...((tv?.מוצרי_בסיס_ומסלולים as { שם?: string; מחיר_חודשי?: number; מחיר?: number }[]) ?? []),
      ...((yesCatalog.טריפל_ובנדלים as { שם?: string; מחיר_חודשי?: number; מחיר?: number }[]) ?? []),
      ...((yesCatalog.מבצעים_שמופיעים_באתר as { שם?: string; מחיר_חודשי?: number; מחיר?: number }[]) ?? []),
    ];
    const hit = all.find((p) => p.שם?.includes(nameOrId));
    return hit ? { nameHe: hit.שם, priceMonthly: hit.מחיר_חודשי ?? hit.מחיר } : null;
  },
  async lookup_channels(query: string) {
    const { channels, yesCatalog } = await getKnowledgeIndex();
    const fromDb = channels.filter((c) => {
      const list = JSON.parse(c.channels) as string[];
      return c.nameHe.includes(query) || list.some((ch) => ch.includes(query));
    });
    if (fromDb.length) return fromDb;
    const catalogHits = await fuzzyMatchChannel(query);
    if (catalogHits) {
      return [
        {
          nameHe: catalogHits.channel.name,
          channels: JSON.stringify([catalogHits.channel.name]),
          description: catalogHits.channel.description,
          packets: catalogHits.channel.packets,
        },
      ];
    }
    if (!yesCatalog) return [];
    const tv = yesCatalog.טלוויזיה as Record<string, unknown> | undefined;
    const paid = (tv?.חבילות_ערוצים_בתשלום as { שם?: string; ערוצים?: string[] }[]) ?? [];
    return paid
      .filter(
        (p) =>
          p.שם?.includes(query) ||
          (p.ערוצים ?? []).some((ch) => ch.includes(query)),
      )
      .map((p) => ({ nameHe: p.שם, channels: JSON.stringify(p.ערוצים ?? []) }));
  },
  async get_channel(name: string) {
    const hit = await findChannelByName(name);
    if (hit) return hit.channel;
    return describeChannel(name);
  },
  async channels_in_packet(packetName: string) {
    return channelsInPacket(packetName);
  },
  async describe_channel(name: string) {
    return describeChannel(name);
  },
  async list_catalog_channels() {
    return listCatalogChannels();
  },
  async list_internet_tiers() {
    return listCatalogInternetTiers();
  },
  async describe_internet(name: string) {
    return describeCatalogInternet(name);
  },
  async router_rental_info() {
    return routerRentalInfo();
  },
  async compare_options() {
    const { packets, tiers } = await getKnowledgeIndex();
    const catalogTiers = await listCatalogInternetTiers();
    const mergedTiers =
      catalogTiers.length > 0
        ? catalogTiers.map((t) => ({
            nameHe: t.name,
            downloadMbps: t.downloadMbps,
            uploadMbps: t.uploadMbps,
            priceMonthly: t.priceMonthly,
          }))
        : tiers.map((t) => ({
            nameHe: t.nameHe,
            downloadMbps: t.downloadMbps,
            uploadMbps: t.uploadMbps,
            priceMonthly: t.priceMonthly,
          }));
    return {
      packets: packets.map((p) => ({
        nameHe: p.nameHe,
        priceMonthly: p.priceMonthly,
        descriptionHe: p.descriptionHe,
      })),
      internetTiers: mergedTiers,
    };
  },
};
