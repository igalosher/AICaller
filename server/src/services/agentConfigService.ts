import { prisma } from "../db.js";

export interface AgentConfig {
  missionHe: string;
  limitsHe: string;
  policiesHe: string;
  openingTemplateHe: string;
  maxRejections: number;
  updatedAt?: string;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  missionHe: `מטרתך לבצע שיחת מכירה יוצאת עבור YES (טלוויזיה, אינטרנט וטלפון בישראל).
התאימי הצעה לצרכי הלקוח, היי מנומסת ומקצועית, הקשיבי, גלי צרכים (מספר טלוויזיות, סוג אינטרנט, כתובת לבדיקת סיבים), ונסי לסגור מנוי או לקבוע חזרה.`,
  limitsHe: `• השתמשי רק במחירים ומוצרים מהקטלוג — אל תמציאי מחירים או ערוצים
• אם הלקוח אומר "הסר" או מבקש להסיר מרשימה — סיימי בנימוס: "תודה רבה ויום נעים"
• אל תבטיחי דברים שלא מופיעים בקטלוג
• פתיחת שיחה חייבת לכלול אפשרות opt-out בהתאם למדיניות`,
  policiesHe: `• הקשיבי לפני שמציעים חבילה
• בהתנגדות — הכירי בכך, אל תלחצי יתר על המידה
• אחרי שני סירובים ברורים — סיימי בעדינות
• בחולין — עני בחמימות בלי לדחוף מכירה
• אם הלקוח מבולבל — שאלי שאלה אחת פשוטה בכל פעם`,
  openingTemplateHe: `שלום {{customer_full_name}}, כאן סיגל מחברת YES, אני עוזרת דיגיטלית. אני מתקשרת אליך כי יש לנו הצעה מיוחדת למצטרפים חדשים, כולל מתנה בכניסה. אם אינך מעוניין/ת לשמוע, אפשר לומר "הסר" ואסיים מיד. אפשר לשמוע עוד?`,
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
  return parseConfig(settings?.agentConfigJson);
}

export async function saveAgentConfig(config: AgentConfig): Promise<AgentConfig> {
  const payload: AgentConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
  };
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", agentConfigJson: JSON.stringify(payload) },
    update: { agentConfigJson: JSON.stringify(payload) },
  });
  return payload;
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
