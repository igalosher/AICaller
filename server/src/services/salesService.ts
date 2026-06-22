import { prisma } from "../db.js";
import { AppError } from "../middleware/errorHandler.js";
import { refreshProductKnowledge } from "./productKnowledge.js";

function parseIds(json: string): string[] {
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

async function validatePacketReferences(data: {
  channelIds?: string;
  internetTierId?: string | null;
  phonePlanId?: string | null;
  active?: boolean;
}) {
  if (data.active === false) return;
  const channelIds = data.channelIds ? parseIds(data.channelIds) : [];
  if (channelIds.length) {
    const count = await prisma.channelPackage.count({
      where: { id: { in: channelIds }, active: true },
    });
    if (count !== channelIds.length) {
      throw new AppError(400, "חבילת ערוצים לא קיימת או לא פעילה");
    }
  }
  if (data.internetTierId) {
    const tier = await prisma.internetTier.findFirst({
      where: { id: data.internetTierId, active: true },
    });
    if (!tier) throw new AppError(400, "מהירות אינטרנט לא קיימת או לא פעילה");
  }
  if (data.phonePlanId) {
    const plan = await prisma.phonePlan.findFirst({
      where: { id: data.phonePlanId, active: true },
    });
    if (!plan) throw new AppError(400, "חבילת טלפון לא קיימת או לא פעילה");
  }
}

export const salesService = {
  listPackets: () => prisma.salesPacket.findMany({ orderBy: { nameHe: "asc" } }),
  getPacket: async (id: string) => {
    const packet = await prisma.salesPacket.findUnique({ where: { id } });
    if (!packet) throw new AppError(404, "חבילה לא נמצאה");
    return packet;
  },
  createPacket: async (data: {
    nameHe: string;
    descriptionHe: string;
    priceMonthly: number;
    contractMonths?: number;
    channelIds?: string[];
    internetTierId?: string;
    phonePlanId?: string;
    active?: boolean;
  }) => {
    const channelIds = JSON.stringify(data.channelIds ?? []);
    await validatePacketReferences({
      channelIds,
      internetTierId: data.internetTierId,
      phonePlanId: data.phonePlanId,
      active: data.active ?? true,
    });
    const packet = await prisma.salesPacket.create({
      data: {
        nameHe: data.nameHe,
        descriptionHe: data.descriptionHe,
        priceMonthly: data.priceMonthly,
        contractMonths: data.contractMonths ?? 12,
        channelIds,
        internetTierId: data.internetTierId,
        phonePlanId: data.phonePlanId,
        active: data.active ?? true,
      },
    });
    await refreshProductKnowledge();
    return packet;
  },
  updatePacket: async (
    id: string,
    data: Partial<{
      nameHe: string;
      descriptionHe: string;
      priceMonthly: number;
      contractMonths: number;
      channelIds: string[];
      internetTierId: string | null;
      phonePlanId: string | null;
      active: boolean;
    }>,
  ) => {
    const existing = await salesService.getPacket(id);
    const channelIds = data.channelIds
      ? JSON.stringify(data.channelIds)
      : existing.channelIds;
    await validatePacketReferences({
      channelIds,
      internetTierId: data.internetTierId ?? existing.internetTierId,
      phonePlanId: data.phonePlanId ?? existing.phonePlanId,
      active: data.active ?? existing.active,
    });
    const packet = await prisma.salesPacket.update({
      where: { id },
      data: {
        nameHe: data.nameHe,
        descriptionHe: data.descriptionHe,
        priceMonthly: data.priceMonthly,
        contractMonths: data.contractMonths,
        internetTierId: data.internetTierId,
        phonePlanId: data.phonePlanId,
        active: data.active,
        ...(data.channelIds ? { channelIds } : {}),
      },
    });
    await refreshProductKnowledge();
    return packet;
  },
  deletePacket: async (id: string) => {
    await salesService.getPacket(id);
    const packet = await prisma.salesPacket.update({
      where: { id },
      data: { active: false },
    });
    await refreshProductKnowledge();
    return packet;
  },

  listChannels: () =>
    prisma.channelPackage.findMany({ orderBy: { nameHe: "asc" } }),
  createChannel: async (data: {
    nameHe: string;
    channels: string[];
    priceAddon?: number;
    active?: boolean;
  }) => {
    const item = await prisma.channelPackage.create({
      data: {
        nameHe: data.nameHe,
        channels: JSON.stringify(data.channels),
        priceAddon: data.priceAddon ?? 0,
        active: data.active ?? true,
      },
    });
    await refreshProductKnowledge();
    return item;
  },
  updateChannel: async (
    id: string,
    data: Partial<{ nameHe: string; channels: string[]; priceAddon: number; active: boolean }>,
  ) => {
    const item = await prisma.channelPackage.update({
      where: { id },
      data: {
        nameHe: data.nameHe,
        priceAddon: data.priceAddon,
        active: data.active,
        ...(data.channels ? { channels: JSON.stringify(data.channels) } : {}),
      },
    });
    await refreshProductKnowledge();
    return item;
  },

  listInternetTiers: () =>
    prisma.internetTier.findMany({ orderBy: { downloadMbps: "asc" } }),
  createInternetTier: async (data: {
    nameHe: string;
    downloadMbps: number;
    uploadMbps: number;
    priceMonthly: number;
    active?: boolean;
  }) => {
    const item = await prisma.internetTier.create({ data });
    await refreshProductKnowledge();
    return item;
  },
  updateInternetTier: async (
    id: string,
    data: Partial<{
      nameHe: string;
      downloadMbps: number;
      uploadMbps: number;
      priceMonthly: number;
      active: boolean;
    }>,
  ) => {
    const item = await prisma.internetTier.update({ where: { id }, data });
    await refreshProductKnowledge();
    return item;
  },

  listPhonePlans: () => prisma.phonePlan.findMany({ orderBy: { nameHe: "asc" } }),
  createPhonePlan: async (data: {
    nameHe: string;
    features: string[];
    priceMonthly: number;
    active?: boolean;
  }) => {
    const item = await prisma.phonePlan.create({
      data: {
        nameHe: data.nameHe,
        features: JSON.stringify(data.features),
        priceMonthly: data.priceMonthly,
        active: data.active ?? true,
      },
    });
    await refreshProductKnowledge();
    return item;
  },
  updatePhonePlan: async (
    id: string,
    data: Partial<{
      nameHe: string;
      features: string[];
      priceMonthly: number;
      active: boolean;
    }>,
  ) => {
    const item = await prisma.phonePlan.update({
      where: { id },
      data: {
        nameHe: data.nameHe,
        priceMonthly: data.priceMonthly,
        active: data.active,
        ...(data.features ? { features: JSON.stringify(data.features) } : {}),
      },
    });
    await refreshProductKnowledge();
    return item;
  },
};
