import { prisma } from "../db.js";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../logger.js";
import { getAiConfig } from "./settingsService.js";
import {
  extractChannelFromUtterance,
  extractPacketFromUtterance,
} from "./catalogChannelLookup.js";
import type { ClassificationResult } from "../flow/graphTypes.js";

export interface ClassifyOptions {
  awaitingRefusalConfirm?: boolean;
  currentNodeId?: string;
}

const INSULT_PATTERNS = [
  "טמבל",
  "מטומטם",
  "idiot",
  "stupid",
  "לעזאזל",
  "תזדיין",
  "מזדיין",
  "חרא",
  "בן זונה",
  "שרמוטה",
];

const DEFAULT_INTENTS = [
  {
    id: "greeting_ack",
    labelHe: "אישור / המשך",
    category: "opening",
    examples: ["כן", "בסדר", "ממשיכים", "אפשר לשמוע", "זמן טוב"],
  },
  {
    id: "price_objection",
    labelHe: "התנגדות מחיר",
    category: "objection",
    examples: ["יקר מדי", "כמה זה עולה", "מה המחיר", "זה יקר לי", "לא יכול להרשות"],
  },
  {
    id: "ask_packet",
    labelHe: "שאלה על חבילה",
    category: "product",
    examples: ["מה כלול בחבילה", "איזו חבילה", "מה בחבילת ילדים", "פרטים על החבילה"],
  },
  {
    id: "ask_channel",
    labelHe: "שאלה על ערוץ",
    category: "product",
    examples: ["יש ספורט 5", "האם יש את הערוץ", "מה זה yes דוקו", "יש לכם את ערוץ"],
  },
  {
    id: "not_interested",
    labelHe: "לא מעוניין",
    category: "objection",
    examples: ["לא מעוניין", "לא רוצה", "אל תתקשרו", "לא בשבילי", "לא תודה"],
  },
  {
    id: "callback",
    labelHe: "בקשה לחזור",
    category: "scheduling",
    examples: ["תחזרו אלי", "מאוחר יותר", "עסוק עכשיו", "תתקשרו מחר"],
  },
  {
    id: "agree_purchase",
    labelHe: "מסכים לרכוש",
    category: "closing",
    examples: ["אני מסכים", "רוצה לסגור", "בוא נסגור", "אני רוצה את החבילה"],
  },
  {
    id: "small_talk",
    labelHe: "שיחת חולין",
    category: "tone",
    examples: ["מה שלומך", "מה נשמע", "איך את", "איך הולך", "מה קורה"],
  },
  {
    id: "insult_profanity",
    labelHe: "עלבון / קללות",
    category: "tone",
    examples: ["טמבל", "idiot", "לעזאזל", "תזדיין", "חרא"],
  },
  {
    id: "ask_internet",
    labelHe: "שאלה על אינטרנט",
    category: "product",
    examples: ["מהירות אינטרנט", "איזה אינטרנט", "כמה מגה", "מהירות גלישה", "סיבים"],
  },
  {
    id: "ask_router_rental",
    labelHe: "שכירות נתב",
    category: "product",
    examples: ["כמה עולה הנתב", "שכירות נתב", "מחיר נתב", "כמה שוכרים נתב"],
  },
  {
    id: "ask_options_compare",
    labelHe: "השוואת אפשרויות",
    category: "product",
    examples: ["מה האפשרויות", "מה עוד יש", "מה ההבדל", "איזה חבילות יש", "מה אפשר לקבל"],
  },
  {
    id: "not_interested_confirmed",
    labelHe: "סירוב מאושר",
    category: "objection",
    examples: ["כן לא מעוניין", "בטוח", "בטח", "כן אני בטוח", "באמת לא"],
  },
  {
    id: "unknown",
    labelHe: "לא ידוע",
    category: "system",
    examples: [],
  },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function seedDefaultIntents(): Promise<void> {
  for (const intent of DEFAULT_INTENTS) {
    await prisma.intent.upsert({
      where: { id: intent.id },
      create: {
        id: intent.id,
        labelHe: intent.labelHe,
        category: intent.category,
        active: true,
      },
      update: {
        labelHe: intent.labelHe,
        category: intent.category,
      },
    });
    for (const phrase of intent.examples) {
      const existing = await prisma.intentExample.findFirst({
        where: { intentId: intent.id, phrase },
      });
      if (!existing) {
        await prisma.intentExample.create({ data: { intentId: intent.id, phrase } });
      }
    }
  }
}

export async function listIntents() {
  const intents = await prisma.intent.findMany({
    include: {
      examples: true,
      _count: { select: { classifications: true } },
    },
    orderBy: { labelHe: "asc" },
  });
  return intents.map((i) => ({
    ...i,
    exampleCount: i._count.classifications,
    usageCount: i._count.classifications,
  }));
}

export async function getIntent(id: string) {
  const intent = await prisma.intent.findUnique({
    where: { id },
    include: { examples: true },
  });
  if (!intent) throw new AppError(404, "כוונה לא נמצאה");
  return intent;
}

export async function createIntent(data: {
  id: string;
  labelHe: string;
  descriptionHe?: string;
  category?: string;
  confidenceThreshold?: number;
}) {
  return prisma.intent.create({ data });
}

export async function updateIntent(
  id: string,
  data: {
    labelHe?: string;
    descriptionHe?: string;
    category?: string;
    active?: boolean;
    confidenceThreshold?: number;
  },
) {
  return prisma.intent.update({ where: { id }, data });
}

export async function addIntentExample(intentId: string, phrase: string) {
  await getIntent(intentId);
  return prisma.intentExample.create({ data: { intentId, phrase } });
}

export async function deleteIntentExample(exampleId: string) {
  return prisma.intentExample.delete({ where: { id: exampleId } });
}

async function ruleClassify(
  utterance: string,
  examples: { intentId: string; phrase: string }[],
): Promise<ClassificationResult | null> {
  const norm = normalize(utterance);
  for (const ex of examples) {
    const phrase = normalize(ex.phrase);
    if (phrase.length >= 2 && norm.includes(phrase)) {
      return {
        intentId: ex.intentId,
        confidence: 0.92,
        entities: {},
        classifier: "rule",
        debug: { matchedPhrase: ex.phrase },
      };
    }
  }
  return null;
}

async function llmClassify(
  utterance: string,
  intents: { id: string; labelHe: string }[],
): Promise<ClassificationResult | null> {
  const config = await getAiConfig();
  if (!config.openaiApiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `סווג כוונת לקוח בשיחת מכירות YES. החזר JSON בלבד: {"intentId":"...","confidence":0.0-1.0}. כוונות: ${intents.map((i) => i.id).join(", ")}`,
          },
          { role: "user", content: utterance },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const parsed = JSON.parse(data.choices[0]?.message?.content ?? "{}") as {
      intentId?: string;
      confidence?: number;
    };
    if (!parsed.intentId) return null;
    return {
      intentId: parsed.intentId,
      confidence: parsed.confidence ?? 0.6,
      entities: {},
      classifier: "llm",
      debug: { raw: parsed },
    };
  } catch (err) {
    logger.warn({ err }, "LLM intent classification failed");
    return null;
  }
}

function matchesInsult(norm: string): boolean {
  return INSULT_PATTERNS.some((p) => norm.includes(p));
}

function matchesSmallTalk(norm: string): boolean {
  return (
    norm.includes("מה שלומך") ||
    norm.includes("מה נשמע") ||
    norm.includes("איך את") ||
    norm.includes("איך הולך") ||
    norm.includes("מה קורה")
  );
}

function ruleToneAndProduct(utterance: string): ClassificationResult | null {
  const norm = normalize(utterance);
  if (matchesInsult(norm)) {
    return { intentId: "insult_profanity", confidence: 0.95, entities: {}, classifier: "rule" };
  }
  if (matchesSmallTalk(norm)) {
    return { intentId: "small_talk", confidence: 0.9, entities: {}, classifier: "rule" };
  }
  if (norm.includes("נתב") && (norm.includes("כמה") || norm.includes("שכירות") || norm.includes("מחיר"))) {
    return { intentId: "ask_router_rental", confidence: 0.88, entities: {}, classifier: "rule" };
  }
  if (norm.includes("אינטרנט") || norm.includes("מהירות") || norm.includes("סיבים") || norm.includes("מגה")) {
    return { intentId: "ask_internet", confidence: 0.85, entities: {}, classifier: "rule" };
  }
  if (
    norm.includes("אפשרויות") ||
    norm.includes("מה עוד") ||
    norm.includes("הבדל") ||
    norm.includes("מה יש לכם")
  ) {
    return { intentId: "ask_options_compare", confidence: 0.82, entities: {}, classifier: "rule" };
  }
  return null;
}

function classifyRefusalConfirm(utterance: string, awaiting: boolean): ClassificationResult | null {
  const norm = normalize(utterance);
  if (!awaiting) return null;
  if (
    norm.includes("בטוח") ||
    norm.includes("בטח") ||
    norm.includes("כן לא") ||
    norm === "כן" ||
    norm.includes("לא מעוניין")
  ) {
    return {
      intentId: "not_interested_confirmed",
      confidence: 0.9,
      entities: {},
      classifier: "rule",
      debug: { awaitingRefusalConfirm: true },
    };
  }
  if (
    norm.includes("לא בטוח") ||
    norm.includes("תשמעי") ||
    norm.includes("אפשר לשמוע") ||
    norm.includes("כן תסבירי")
  ) {
    return {
      intentId: "greeting_ack",
      confidence: 0.85,
      entities: {},
      classifier: "rule",
      debug: { reconsidered: true },
    };
  }
  return null;
}

function keywordFallback(utterance: string): ClassificationResult {
  const tone = ruleToneAndProduct(utterance);
  if (tone) return tone;

  const norm = normalize(utterance);
  if (norm.includes("מחיר") || norm.includes("כמה") || norm.includes("יקר")) {
    return { intentId: "price_objection", confidence: 0.75, entities: {}, classifier: "rule" };
  }
  if (norm.includes("ערוץ") || norm.includes("ספורט") || norm.includes("דוקו")) {
    return { intentId: "ask_channel", confidence: 0.7, entities: {}, classifier: "rule" };
  }
  if (norm.includes("חבילה") || norm.includes("כלול")) {
    return { intentId: "ask_packet", confidence: 0.7, entities: {}, classifier: "rule" };
  }
  if (norm.includes("לא מעוניין") || norm.includes("לא רוצה")) {
    return { intentId: "not_interested", confidence: 0.85, entities: {}, classifier: "rule" };
  }
  if (norm.includes("חזור") || norm.includes("מאוחר")) {
    return { intentId: "callback", confidence: 0.8, entities: {}, classifier: "rule" };
  }
  if (norm.includes("מסכים") || norm.includes("לסגור") || norm.includes("רוצה את")) {
    return { intentId: "agree_purchase", confidence: 0.8, entities: {}, classifier: "rule" };
  }
  if (norm === "כן" || norm.includes("בסדר")) {
    return { intentId: "greeting_ack", confidence: 0.8, entities: {}, classifier: "rule" };
  }
  return { intentId: "unknown", confidence: 0.3, entities: {}, classifier: "rule" };
}

export async function classifyUtterance(
  utterance: string,
  options: ClassifyOptions = {},
): Promise<ClassificationResult> {
  const awaiting =
    options.awaitingRefusalConfirm ||
    options.currentNodeId === "listen_confirm" ||
    options.currentNodeId === "route_confirm";

  const confirmResult = classifyRefusalConfirm(utterance, awaiting);
  if (confirmResult) return confirmResult;

  const toneEarly = ruleToneAndProduct(utterance);
  if (toneEarly) return toneEarly;

  const intents = await prisma.intent.findMany({ where: { active: true } });
  const examples = await prisma.intentExample.findMany();
  const rule = await ruleClassify(utterance, examples);
  let result = rule ?? (await llmClassify(utterance, intents)) ?? keywordFallback(utterance);

  if (!awaiting && result.intentId === "not_interested_confirmed") {
    result = { ...result, intentId: "not_interested", confidence: result.confidence };
  }

  const channelHit = await extractChannelFromUtterance(utterance);
  if (channelHit) {
    result.entities.channel = channelHit.channel.name;
    result.entities.channelId = channelHit.channel.id;
    if (result.intentId === "unknown") {
      result.intentId = "ask_channel";
      result.confidence = Math.max(result.confidence, channelHit.confidence);
    }
  }

  const packet = await extractPacketFromUtterance(utterance);
  if (packet) {
    result.entities.packet = packet;
    if (result.intentId === "unknown") {
      result.intentId = "ask_packet";
      result.confidence = Math.max(result.confidence, 0.65);
    }
  }

  return result;
}

export async function getIntentThresholds(): Promise<Record<string, number>> {
  const intents = await prisma.intent.findMany({ where: { active: true } });
  return Object.fromEntries(intents.map((i) => [i.id, i.confidenceThreshold]));
}

export async function persistClassification(
  segmentId: string,
  callId: string,
  result: ClassificationResult,
) {
  return prisma.utteranceClassification.create({
    data: {
      segmentId,
      callId,
      intentId: result.intentId,
      confidence: result.confidence,
      entitiesJson: JSON.stringify(result.entities),
      classifier: result.classifier,
      debugJson: result.debug ? JSON.stringify(result.debug) : null,
    },
    include: { intent: true },
  });
}

export async function relabelUtterance(
  segmentId: string,
  intentId: string,
  addAsExample: boolean,
) {
  const segment = await prisma.callTranscriptSegment.findUnique({
    where: { id: segmentId },
    include: { classification: true },
  });
  if (!segment) throw new AppError(404, "קטע תמלול לא נמצא");

  await getIntent(intentId);

  if (segment.classification) {
    await prisma.utteranceClassification.update({
      where: { id: segment.classification.id },
      data: {
        intentId,
        confidence: 1,
        classifier: "rule",
        debugJson: JSON.stringify({ relabeled: true }),
      },
    });
  } else {
    await persistClassification(segmentId, segment.callId, {
      intentId,
      confidence: 1,
      entities: {},
      classifier: "rule",
      debug: { relabeled: true },
    });
  }

  if (addAsExample) {
    await addIntentExample(intentId, segment.text);
  }

  return prisma.utteranceClassification.findUnique({
    where: { segmentId },
    include: { intent: true },
  });
}
