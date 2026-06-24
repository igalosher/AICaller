import { logger } from "../logger.js";
import { timed } from "./metrics.js";
import { getAiConfig } from "../services/settingsService.js";
import { productTools } from "../services/productKnowledge.js";

export interface LlmResponse {
  text: string;
  outcome?: "sold" | "refused" | "callback" | null;
}

import type { ContactSex } from "@prisma/client";
import { genderPromptHint } from "../utils/genderHebrew.js";

export interface SalesReplyContext {
  customerFirstName: string;
  customerSex?: ContactSex;
  stagePrompt: string;
  /** True only for the first opening speak node — enables self-introduction. */
  isOpeningTurn?: boolean;
  /** Question to re-ask after a mid-call Q&A answer (not read as script to paraphrase). */
  repeatQuestion?: string;
  channelContext?: string;
  packetContext?: string;
  internetContext?: string;
  routerContext?: string;
  optionsContext?: string;
  nodeText?: string;
}

const SYSTEM_PROMPT_OPENING = `את סיגל, עוזרת דיגיטלית של YES (טלוויזיה, טלפון ואינטרנט בישראל).
דברי בעברית טבעית, חמה ומקצועית, בגובה העיניים.
בפתיחת שיחה בלבד — הציגי את עצמך פעם אחת כעוזרת דיגיטלית מ-YES, עם אזכור הצעה ומתנה למצטרפים.
עני על שאלות לפי מידע מדויק מהקטלוג והחבילות בלבד.
אל תחזרי על שם הלקוח בכל משפט.`;

const SYSTEM_PROMPT_MID_CALL = `את סיגל מ-YES בשיחת מכירה שכבר התחילה.
דברי בעברית טבעית, קצרה וממוקדת.
חשוב: אל תציגי את עצמך שוב. אל תאמרי "שלום", "אני סיגל", "העוזרת הדיגיטלית" או כל הצגה מחדש.
עני רק על מה שהלקוח שאל — ערוץ, חבילה, מחיר, אינטרנט, נתב או אפשרויות — לפי הקטלוג.
בשיחת חולין — עני בחמימות בלי לדחוף מכירה.
אם הלקוח מקלל — עני בעדינות ובכבוד.
אם הלקוח אומר "הסר" — סיימי בנימוס.
אל תחזרי על שם הלקוח בכל משפט.`;

const INTRO_PATTERNS = [
  /^שלום[,!\s]*/i,
  /אני סיגל[^.]*\.?\s*/g,
  /כאן סיגל[^.]*\.?\s*/g,
  /העוזרת הדיגיטלית[^.]*\.?\s*/g,
  /עוזרת דיגיטלית מ?-?YES[^.]*\.?\s*/gi,
  /מחברת YES[^.]*\.?\s*/g,
];

function stripRepeatedIntroduction(text: string): string {
  let out = text.trim();
  for (const pattern of INTRO_PATTERNS) {
    out = out.replace(pattern, "").trim();
  }
  out = out.replace(/^[,.!\s]+/, "").trim();
  return out || text.trim();
}

export async function generateSalesReply(
  userMessage: string,
  context: SalesReplyContext,
): Promise<LlmResponse> {
  const config = await getAiConfig();
  const [packets, internetTiers, routerInfo, options] = await Promise.all([
    productTools.list_packets(),
    productTools.list_internet_tiers(),
    productTools.router_rental_info(),
    productTools.compare_options(),
  ]);

  const productContext = [
    `חבילות: ${JSON.stringify(packets)}`,
    `אינטרנט: ${JSON.stringify(internetTiers)}`,
    `שכירות נתב: ${routerInfo.summaryHe}`,
    `אפשרויות: ${JSON.stringify(options)}`,
    context.channelContext ? `ערוץ: ${context.channelContext}` : "",
    context.packetContext ? `חבילה: ${context.packetContext}` : "",
    context.internetContext ? `אינטרנט (הקשר): ${context.internetContext}` : "",
    context.routerContext ? `נתב: ${context.routerContext}` : "",
    context.optionsContext ? `השוואה: ${context.optionsContext}` : "",
  ]
    .filter(Boolean)
    .join(". ");

  if (config.openaiApiKey) {
    const opening = context.isOpeningTurn === true;
    const systemPrompt = opening ? SYSTEM_PROMPT_OPENING : SYSTEM_PROMPT_MID_CALL;
    const contextLine = opening
      ? `שם פרטי (להקשר בלבד): ${context.customerFirstName}. ${genderPromptHint(context.customerSex ?? "male")} טקסט הפתיחה: ${context.stagePrompt}. ${productContext}`
      : [
          `שם פרטי (להקשר בלבד): ${context.customerFirstName}.`,
          genderPromptHint(context.customerSex ?? "male"),
          context.repeatQuestion ? `לאחר מענה — הלקוח ישמע שוב את השאלה: "${context.repeatQuestion}"` : "",
          productContext,
          context.nodeText ? `הנחיית צומת (לא לקרוא כלשון): ${context.nodeText}` : "",
        ]
          .filter(Boolean)
          .join(" ");

    return timed("llm_round_trip", undefined, async () => {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "system", content: contextLine },
            {
              role: "user",
              content: opening
                ? `הקריאי את פתיחת השיחה לפי הטקסט. הציגי את עצמך פעם אחת בלבד: ${context.stagePrompt}`
                : userMessage,
            },
          ],
          temperature: opening ? 0.4 : 0.3,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        logger.warn(
          { status: res.status, body: body.slice(0, 200) },
          "OpenAI request failed, using fallback",
        );
        return fallbackReply(userMessage, context);
      }
      const data = (await res.json()) as {
        choices: { message: { content: string } }[];
      };
      let text = data.choices[0]?.message?.content ?? fallbackReply(userMessage, context).text;
      if (!opening) {
        text = stripRepeatedIntroduction(text);
      }
      return { text, outcome: detectOutcome(userMessage) };
    });
  }

  return fallbackReply(userMessage, context);
}

function fallbackReply(userMessage: string, context: SalesReplyContext): LlmResponse {
  const lower = userMessage.toLowerCase();
  if (lower.includes("מחיר") || lower.includes("כמה")) {
    return {
      text: "יש לנו חבילות החל מ-99 שקלים לחודש. אשמח לפרט על החבילה המתאימה לך.",
    };
  }
  if (lower.includes("נתב")) {
    return { text: "שכירות נתב סיבים מתחילה מ-20 שקלים לחודש לפי הקטלוג שלנו." };
  }
  if (lower.includes("אינטרנט") || lower.includes("מהירות")) {
    return { text: "יש לנו אפשרויות אינטרנט סיבים מ-300 מגה ועד 2500 מגה. אשמח לפרט." };
  }
  if (lower.includes("מה שלומך") || lower.includes("מה נשמע") || lower.includes("איך את")) {
    return { text: "תודה ששאלת! בסדר גמור, אשמח לעזור לך." };
  }
  if (/^(היי|הי|שלום|הלו|hi|hey|hello)$/.test(lower.trim())) {
    return { text: "היי! שמחה לדבר איתך." };
  }
  if (matchesInsult(lower)) {
    return { text: "אני מבינה, אבל לא נעים לשמוע שפה כזו. בוא נמשיך בכבוד." };
  }
  if (lower.includes("לא מעוניין") || lower.includes("לא רוצה")) {
    return { text: "הבנתי. רק לוודא — האם אתה בטוח שאתה לא מעוניין?" };
  }
  if (context.isOpeningTurn) {
    return { text: context.stagePrompt || "אשמח לעזור. אפשר לחזור על השאלה?" };
  }
  return { text: "אשמח לעזור. אפשר לחזור על השאלה?" };
}

function matchesInsult(text: string): boolean {
  const patterns = ["טמבל", "מטומטם", "idiot", "stupid", "לעזאזל", "תזדיין", "מזדיין", "חרא", "בן זונה"];
  return patterns.some((p) => text.includes(p));
}

export function detectOutcome(customerText: string): LlmResponse["outcome"] {
  const lower = customerText.toLowerCase();
  if (
    lower.includes("יום טוב") &&
    (lower.includes("תודה") || lower.includes("לא מעוניין"))
  ) {
    return "refused";
  }
  if (
    lower.includes("תחזרו") ||
    lower.includes("חזרו אלי") ||
    lower.includes("מאוחר יותר") ||
    lower.includes("עסוק עכשיו")
  ) {
    return "callback";
  }
  if (
    lower.includes("אני מסכים") ||
    lower.includes("בוא נסגור") ||
    lower.includes("רוצה לסגור") ||
    lower.includes("רוצה את החבילה") ||
    lower.includes("קונה את") ||
    (lower.includes("מסכים") &&
      !lower.includes("מציע") &&
      !lower.includes("מה עוד") &&
      !lower.includes("מה את"))
  ) {
    return "sold";
  }
  return null;
}
