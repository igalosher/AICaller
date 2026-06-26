import { prisma } from "../db.js";
import { AppError } from "../middleware/errorHandler.js";

export interface AgentConfig {
  missionHe: string;
  limitsHe: string;
  policiesHe: string;
  openingTemplateHe: string;
  maxRejections: number;
  updatedAt?: string;
  currentVersionNumber?: number;
}

export type AgentConfigVersionSource = "manual_save" | "restore" | "draft_approval";

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  missionHe: `מטרתך לבצע שיחת מכירה יוצאת עבור YES (טלוויזיה, אינטרנט וטלפון בישראל).
את התקשרת ללקוח — הוא לא פנה אליך. מטרתך להציע מנוי ולסגור, לא לברר "מה הוא מחפש".
התאימי הצעה מהקטלוג, היי מנומסת ומקצועית, והקשיבי לתשובות. אספי מידע עובדתי בלבד (כמה טלוויזיות בבית, איזה אינטרנט יש היום, כתובת לבדיקת סיבים) כדי להתאים חבילה, ונסי לסגור מנוי או לקבוע חזרה.`,
  limitsHe: `• השתמשי רק במחירים ומוצרים מהקטלוג — אל תמציאי מחירים או ערוצים
• אסור לשאול "מה אתה מחפש", "איזה סוג אינטרנט אתה מחפש" או ניסוחים דומים — זו שיחה יוצאת
• אם הלקוח אומר "הסר" או מבקש להסיר מרשימה — סיימי בנימוס: "תודה רבה ויום נעים"
• אל תבטיחי דברים שלא מופיעים בקטלוג
• פתיחת שיחה חייבת לכלול אפשרות opt-out בהתאם למדיניות`,
  policiesHe: `• הקשיבי לפני שמציעים חבילה
• אחרי עניין ראשוני — שאלי שאלה עובדתית אחת (למשל כמה טלוויזיות בבית), ואז הציעי חבילה מהקטלוג
• אל תשאלי על העדפות או "מה מחפשים" לפני הצעה
• בהתנגדות — הכירי בכך, אל תלחצי יתר על המידה
• אחרי שני סירובים ברורים — סיימי בעדינות
• בחולין — עני בחמימות בלי לדחוף מכירה
• אם הלקוח מבולבל — שאלי שאלה עובדתית אחת בכל פעם, לא על העדפות`,
  openingTemplateHe: `שלום {{customer_full_name}}, כאן סיגל מחברת YES, אני עוזרת דיגיטלית. אני מתקשרת אליך כי יש לנו הצעה מיוחדת למצטרפים חדשים, כולל מתנה בכניסה. אם אינך {{g:מעוניין|מעוניינת}} לשמוע, אפשר לומר "הסר" ואסיים מיד. אפשר לשמוע עוד?`,
  maxRejections: 2,
};

function parseConfig(raw: string | null | undefined): AgentConfig {
  if (!raw) return { ...DEFAULT_AGENT_CONFIG };
  try {
    const parsed = JSON.parse(raw) as Partial<AgentConfig>;
    return {
      missionHe: parsed.missionHe ?? DEFAULT_AGENT_CONFIG.missionHe,
      limitsHe: parsed.limitsHe ?? DEFAULT_AGENT_CONFIG.limitsHe,
      policiesHe: parsed.policiesHe ?? DEFAULT_AGENT_CONFIG.policiesHe,
      openingTemplateHe: parsed.openingTemplateHe ?? DEFAULT_AGENT_CONFIG.openingTemplateHe,
      maxRejections: parsed.maxRejections ?? DEFAULT_AGENT_CONFIG.maxRejections,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return { ...DEFAULT_AGENT_CONFIG };
  }
}

export async function getAgentConfig(): Promise<AgentConfig> {
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const config = parseConfig(settings?.agentConfigJson);
  const latest = await prisma.agentConfigVersion.findFirst({
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return { ...config, currentVersionNumber: latest?.versionNumber };
}

async function nextVersionNumber(): Promise<number> {
  const last = await prisma.agentConfigVersion.findFirst({
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return (last?.versionNumber ?? 0) + 1;
}

async function appendConfigVersion(
  config: AgentConfig,
  source: AgentConfigVersionSource,
  label?: string,
): Promise<number> {
  const versionNumber = await nextVersionNumber();
  await prisma.agentConfigVersion.create({
    data: {
      versionNumber,
      configJson: JSON.stringify(config),
      source,
      label: label ?? null,
    },
  });
  return versionNumber;
}

export async function backfillAgentConfigVersionIfEmpty(): Promise<void> {
  const count = await prisma.agentConfigVersion.count();
  if (count > 0) return;
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const config = parseConfig(settings?.agentConfigJson);
  await appendConfigVersion(
    { ...config, updatedAt: config.updatedAt ?? new Date().toISOString() },
    "manual_save",
    "גיבוי ראשוני",
  );
}

/** Upgrade stored config that still uses the old "discover what customer wants" mission wording. */
export async function patchAgentConfigOutboundSalesIfNeeded(): Promise<void> {
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const config = parseConfig(settings?.agentConfigJson);
  if (!config.missionHe.includes("גלי צרכים")) return;

  await saveAgentConfig(
    {
      missionHe: DEFAULT_AGENT_CONFIG.missionHe,
      limitsHe: DEFAULT_AGENT_CONFIG.limitsHe,
      policiesHe: DEFAULT_AGENT_CONFIG.policiesHe,
      openingTemplateHe: config.openingTemplateHe,
      maxRejections: config.maxRejections,
    },
    { source: "manual_save", label: "עדכון: שיחה יוצאת — בלי שאלות 'מה מחפשים'" },
  );
}

export async function saveAgentConfig(
  config: AgentConfig,
  options?: { source?: AgentConfigVersionSource; label?: string },
): Promise<AgentConfig> {
  const payload: AgentConfig = {
    missionHe: config.missionHe,
    limitsHe: config.limitsHe,
    policiesHe: config.policiesHe,
    openingTemplateHe: config.openingTemplateHe,
    maxRejections: config.maxRejections,
    updatedAt: new Date().toISOString(),
  };
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", agentConfigJson: JSON.stringify(payload) },
    update: { agentConfigJson: JSON.stringify(payload) },
  });
  const versionNumber = await appendConfigVersion(
    payload,
    options?.source ?? "manual_save",
    options?.label,
  );
  return { ...payload, currentVersionNumber: versionNumber };
}

export async function listAgentVersions(limit = 20) {
  return prisma.agentConfigVersion.findMany({
    orderBy: { versionNumber: "desc" },
    take: limit,
    select: {
      id: true,
      versionNumber: true,
      label: true,
      source: true,
      createdAt: true,
    },
  });
}

export async function getAgentVersion(id: string) {
  const row = await prisma.agentConfigVersion.findUnique({ where: { id } });
  if (!row) return null;
  return {
    ...row,
    config: parseConfig(row.configJson),
  };
}

export async function restoreAgentVersion(id: string): Promise<AgentConfig> {
  const row = await getAgentVersion(id);
  if (!row) throw new AppError(404, "גרסה לא נמצאה");
  return saveAgentConfig(row.config, {
    source: "restore",
    label: `שחזור מגרסה ${row.versionNumber}`,
  });
}

export interface AgentExampleInput {
  customerText: string;
  aiResponseBad?: string;
  correctedText: string;
  callId?: string;
  segmentId?: string;
  tags?: string[];
}

export async function listAgentExamples(limit = 100) {
  return prisma.agentResponseExample.findMany({
    where: { approved: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function createAgentExample(input: AgentExampleInput) {
  return prisma.agentResponseExample.create({
    data: {
      customerText: input.customerText.trim(),
      aiResponseBad: input.aiResponseBad?.trim() || null,
      correctedText: input.correctedText.trim(),
      callId: input.callId ?? null,
      segmentId: input.segmentId ?? null,
      tags: JSON.stringify(input.tags ?? []),
      approved: true,
    },
  });
}

export async function deleteAgentExample(id: string) {
  await prisma.agentResponseExample.delete({ where: { id } });
}

function tokenizeHe(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

export async function findRelevantAgentExamples(customerText: string, limit = 3) {
  const words = tokenizeHe(customerText);
  if (words.length === 0) return [];

  const examples = await prisma.agentResponseExample.findMany({
    where: { approved: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const scored = examples
    .map((ex) => {
      const exWords = new Set(tokenizeHe(ex.customerText));
      let score = 0;
      for (const w of words) {
        if (exWords.has(w)) score += 1;
      }
      return { ex, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s) => s.ex);
}
