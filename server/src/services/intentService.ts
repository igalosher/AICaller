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
    id: "opt_out_remove",
    labelHe: "הסרה מרשימה",
    category: "compliance",
    examples: ["הסר", "תסירו אותי", "הסירו אותי", "remove me"],
  },
  {
    id: "ask_offer",
    labelHe: "שאלה על ההצעה",
    category: "opening",
    examples: ["מה ההצעה", "תספרי על ההצעה", "מה יש לכם", "מה המבצע"],
  },
  {
    id: "didnt_understand",
    labelHe: "לא הבנתי",
    category: "tone",
    examples: ["לא הבנתי", "מה", "מה?", "תחזרי על זה", "שוב"],
  },
  {
    id: "provide_tv_count",
    labelHe: "מספר טלוויזיות",
    category: "qualification",
    examples: ["אחת", "שתיים", "2", "שלוש טלוויזיות", "4"],
  },
  {
    id: "internet_regular",
    labelHe: "אינטרנט רגיל",
    category: "qualification",
    examples: ["רגיל", "אינטרנט רגיל", "לא סיבים"],
  },
  {
    id: "internet_fiber",
    labelHe: "סיבים",
    category: "qualification",
    examples: ["סיבים", "סיבים אופטיים", "פייבר"],
  },
  {
    id: "internet_unknown",
    labelHe: "לא יודע תשתית",
    category: "qualification",
    examples: ["לא יודע", "לא בטוח", "אין מושג"],
  },
  {
    id: "no_internet",
    labelHe: "אין אינטרנט",
    category: "qualification",
    examples: ["אין לי אינטרנט", "בלי אינטרנט", "אין אינטרנט בבית"],
  },
  {
    id: "provide_address",
    labelHe: "כתובת",
    category: "qualification",
    examples: ["תל אביב הרצל 1", "רחוב הרצל 5 תל אביב"],
  },
  {
    id: "select_speed_100",
    labelHe: "100 מגה",
    category: "qualification",
    examples: ["מאה מגה", "100", "מאה"],
  },
  {
    id: "select_speed_200",
    labelHe: "200 מגה",
    category: "qualification",
    examples: ["מאתיים מגה", "200", "מאתיים"],
  },
  {
    id: "select_speed_300",
    labelHe: "300 מגה",
    category: "qualification",
    examples: ["שלוש מאות", "300", "שלוש מאות מגה"],
  },
  {
    id: "select_speed_600",
    labelHe: "600 מגה",
    category: "qualification",
    examples: ["שש מאות", "600", "שש מאות מגה"],
  },
  {
    id: "select_speed_1000",
    labelHe: "גיגה",
    category: "qualification",
    examples: ["גיגה", "אלף מגה", "1000"],
  },
  {
    id: "provider_bezeq",
    labelHe: "ספק בזק",
    category: "qualification",
    examples: ["בזק"],
  },
  {
    id: "provider_hot",
    labelHe: "ספק הוט",
    category: "qualification",
    examples: ["הוט", "hot"],
  },
  {
    id: "provider_partner",
    labelHe: "ספק פרטנר",
    category: "qualification",
    examples: ["פרטנר", "partner"],
  },
  {
    id: "provider_cellcom",
    labelHe: "ספק סלקום",
    category: "qualification",
    examples: ["סלקום", "cellcom"],
  },
  {
    id: "provider_other",
    labelHe: "ספק אחר",
    category: "qualification",
    examples: ["אחר", "ספק אחר"],
  },
  {
    id: "provide_current_price",
    labelHe: "מחיר נוכחי",
    category: "qualification",
    examples: ["משלם 150", "מאה וחמישים שקל"],
  },
  {
    id: "select_addons",
    labelHe: "בחירת תוספות",
    category: "closing",
    examples: ["כן תוסיפי ספורט", "רוצה VOD", "תוסיפי"],
  },
  {
    id: "decline_addons",
    labelHe: "ללא תוספות",
    category: "closing",
    examples: ["לא תודה", "בלי תוספות", "לא צריך"],
  },
  {
    id: "agree_callback",
    labelHe: "מסכים לשיחה חוזרת",
    category: "closing",
    examples: ["כן תחזרו", "בטח", "כן נציג", "מעוניין"],
  },
  {
    id: "decline_callback",
    labelHe: "לא לשיחה חוזרת",
    category: "closing",
    examples: ["לא תודה", "לא צריך", "לא מעוניין"],
  },
  {
    id: "silence",
    labelHe: "שתיקה",
    category: "system",
    examples: [],
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

function extractTvCount(norm: string): number | null {
  const digit = norm.match(/\d+/);
  if (digit) return Math.min(10, parseInt(digit[0]!, 10));
  const words: Record<string, number> = {
    אחת: 1,
    אחד: 1,
    שתיים: 2,
    שניים: 2,
    שלוש: 3,
    ארבע: 4,
    חמש: 5,
    שש: 6,
  };
  for (const [w, n] of Object.entries(words)) {
    if (norm.includes(w)) return n;
  }
  return null;
}

function extractPrice(norm: string): number | null {
  const digit = norm.match(/(\d{2,4})/);
  if (digit) return parseInt(digit[1]!, 10);
  return null;
}

function ruleStagedQualification(utterance: string): ClassificationResult | null {
  const norm = normalize(utterance);
  if (norm === "הסר" || norm.includes("תסירו אותי") || norm.includes("הסירו אותי")) {
    return { intentId: "opt_out_remove", confidence: 0.98, entities: {}, classifier: "rule" };
  }
  if (
    norm === "מה" ||
    norm === "מה?" ||
    norm.includes("לא הבנתי") ||
    norm.includes("תחזרי על") ||
    norm === "שוב"
  ) {
    return { intentId: "didnt_understand", confidence: 0.95, entities: {}, classifier: "rule" };
  }
  if (norm.includes("מה ההצעה") || norm.includes("תספרי על ההצעה")) {
    return { intentId: "ask_offer", confidence: 0.92, entities: {}, classifier: "rule" };
  }
  if (norm.includes("אין לי אינטרנט") || norm.includes("בלי אינטרנט")) {
    return { intentId: "no_internet", confidence: 0.9, entities: {}, classifier: "rule" };
  }
  if (norm === "רגיל" || norm.includes("אינטרנט רגיל")) {
    return { intentId: "internet_regular", confidence: 0.9, entities: {}, classifier: "rule" };
  }
  if (norm === "סיבים" || norm.includes("סיבים אופטיים") || norm.includes("פייבר")) {
    return { intentId: "internet_fiber", confidence: 0.9, entities: {}, classifier: "rule" };
  }
  if (norm.includes("לא יודע") || norm.includes("לא בטוח")) {
    return { intentId: "internet_unknown", confidence: 0.88, entities: {}, classifier: "rule" };
  }
  if (norm.includes("בזק")) {
    return { intentId: "provider_bezeq", confidence: 0.9, entities: {}, classifier: "rule" };
  }
  if (norm.includes("הוט") || norm.includes("hot")) {
    return { intentId: "provider_hot", confidence: 0.9, entities: {}, classifier: "rule" };
  }
  if (norm.includes("פרטנר") || norm.includes("partner")) {
    return { intentId: "provider_partner", confidence: 0.9, entities: {}, classifier: "rule" };
  }
  if (norm.includes("סלקום") || norm.includes("cellcom")) {
    return { intentId: "provider_cellcom", confidence: 0.9, entities: {}, classifier: "rule" };
  }
  if (norm.includes("גיגה") || norm.includes("אלף מגה")) {
    return { intentId: "select_speed_1000", confidence: 0.88, entities: {}, classifier: "rule" };
  }
  if (norm.includes("שש מאות") || norm === "600") {
    return { intentId: "select_speed_600", confidence: 0.88, entities: {}, classifier: "rule" };
  }
  if (norm.includes("שלוש מאות") || norm === "300") {
    return { intentId: "select_speed_300", confidence: 0.88, entities: {}, classifier: "rule" };
  }
  if (norm.includes("מאתיים") || norm === "200") {
    return { intentId: "select_speed_200", confidence: 0.88, entities: {}, classifier: "rule" };
  }
  if (norm.includes("מאה מגה") || (norm.includes("מאה") && !norm.includes("מאתיים"))) {
    return { intentId: "select_speed_100", confidence: 0.85, entities: {}, classifier: "rule" };
  }
  const tv = extractTvCount(norm);
  if (tv != null && (norm.includes("טלוויז") || norm.includes("מסך") || /^\d+$/.test(norm) || tv <= 6)) {
    return {
      intentId: "provide_tv_count",
      confidence: 0.88,
      entities: { tv_count: tv },
      classifier: "rule",
    };
  }
  const price = extractPrice(norm);
  if (price != null && (norm.includes("משלם") || norm.includes("שקל") || norm.includes("₪"))) {
    return {
      intentId: "provide_current_price",
      confidence: 0.85,
      entities: { monthly_price: price },
      classifier: "rule",
    };
  }
  if (norm.length >= 8 && (norm.includes("רחוב") || norm.includes("תל אביב") || /\d/.test(norm))) {
    return {
      intentId: "provide_address",
      confidence: 0.8,
      entities: { address: utterance.trim() },
      classifier: "rule",
    };
  }
  if (norm.includes("תחזרו") && (norm.includes("כן") || norm.includes("בטח") || norm.includes("נציג"))) {
    return { intentId: "agree_callback", confidence: 0.88, entities: {}, classifier: "rule" };
  }
  return null;
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
  if (norm.includes("אינטרנט") || norm.includes("מהירות") || norm.includes("מגה")) {
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

  const stagedEarly = ruleStagedQualification(utterance);
  if (stagedEarly) return stagedEarly;

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
