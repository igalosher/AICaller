import { logger } from "../logger.js";
import { timed } from "./metrics.js";
import { getAiConfig } from "../services/settingsService.js";
import { productTools } from "../services/productKnowledge.js";

export interface LlmResponse {
  text: string;
  outcome?: "sold" | "refused" | "callback" | null;
}

export interface SalesReplyContext {
  customerFirstName: string;
  stagePrompt: string;
  isOpeningTurn?: boolean;
  channelContext?: string;
  packetContext?: string;
  internetContext?: string;
  routerContext?: string;
  optionsContext?: string;
  nodeText?: string;
}

const SYSTEM_PROMPT = `את סיגל, נציגת מכירות של YES (טלוויזיה, טלפון ואינטרנט בישראל).
דברי בעברית טבעית, חמה ומקצועית, בגובה העיניים.
בפתיחת שיחה — אל תשאלי אם הלקוח מעוניין לקנות; הציעי מבצעים או שאלי אם אפשר להציע הצעות.
עני על שאלות לפי מידע מדויק מהקטלוג והחבילות בלבד — ערוצים, חבילות, אינטרנט, שכירות נתב ואפשרויות.
בשיחת חולין (איך את, מה שלומך) — עני בחמימות בלי לדחוף מכירה מיד.
אם הלקוח מקלל או מעליב — אמרי בעדינות שזה לא מכבד ולא נעים לשמוע, והמשיכי בכבוד.
אם הלקוח אומר שלא מעוניין בפעם הראשונה — אל תסיימי את השיחה; השאילי אם הוא בטוח.
סיימי שיחה בסירוב רק אחרי אישור מפורש.
זהי כוונות: מכירה (sold), בקשה לחזור (callback). אל תסיימי בסירוב בלי אישור.
כשהלקוח מביע עניין לסגור — אמרי שנציג אנושי יחזור אליו לסגירת העסקה, תודה ויום טוב, וסיימי.
אל תחזרי על שם הלקוח בכל משפט.`;

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
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "system",
              content: `שם פרטי (להקשר בלבד): ${context.customerFirstName}. שלב נוכחי: ${context.stagePrompt}. ${productContext}${context.nodeText ? `. הנחיית צומת: ${context.nodeText}` : ""}`,
            },
            {
              role: "user",
              content: context.isOpeningTurn
                ? `המשיכי את השיחה לפי שלב: ${context.stagePrompt}`
                : userMessage,
            },
          ],
          temperature: 0.4,
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
      const text = data.choices[0]?.message?.content ?? fallbackReply(userMessage, context).text;
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
  if (matchesInsult(lower)) {
    return { text: "אני מבינה, אבל לא נעים לשמוע שפה כזו. בוא נמשיך בכבוד." };
  }
  if (lower.includes("לא מעוניין") || lower.includes("לא רוצה")) {
    return { text: "הבנתי. רק לוודא — האם אתה בטוח שאתה לא מעוניין?" };
  }
  return {
    text: context.isOpeningTurn ? context.stagePrompt : context.stagePrompt,
  };
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
