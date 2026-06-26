import { prisma } from "../db.js";

export type ConversationMode = "flow" | "agent";

export async function getConversationMode(): Promise<ConversationMode> {
  try {
    const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
    return settings?.conversationMode === "agent" ? "agent" : "flow";
  } catch {
    return "flow";
  }
}

export async function saveConversationMode(mode: ConversationMode): Promise<ConversationMode> {
  try {
    await prisma.appSettings.upsert({
      where: { id: "default" },
      create: { id: "default", conversationMode: mode },
      update: { conversationMode: mode },
    });
  } catch (err) {
    const { logger } = await import("../logger.js");
    logger.error({ err, mode }, "Failed to save conversation mode — run prisma migrate");
    throw err;
  }
  return mode;
}
