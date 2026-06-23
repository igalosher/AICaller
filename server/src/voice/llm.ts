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
  nodeText?: string;
}

const SYSTEM_PROMPT = `את נציגת מכירות של YES (טלוויזיה, טלפון ואינטרנט בישראל).
דברי בעברית טבעית, בגובה העיניים, ועני על שאלות לפי מידע מדויק על החבילות בלבד.
אם אין לך מידע — אמרי שאינך בטוחה והציעי שיחזרו אל הלקוח.
זהי כוונות: מכירה (sold), סירוב (refused), בקשה לחזור (callback).
אל תחזרי על שם הלקוח בכל משפט. השם הפרטי כבר נאמר בפתיחה — המשיכי בטבעיות בלי לפתוח כל תשובה בשם.`;

export async function generateSalesReply(
  userMessage: string,
  context: SalesReplyContext,
): Promise<LlmResponse> {
  const config = await getAiConfig();
  const packets = await productTools.list_packets();

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
              content: `שם פרטי (להקשר בלבד): ${context.customerFirstName}. שלב נוכחי: ${context.stagePrompt}. חבילות: ${JSON.stringify(packets)}${context.channelContext ? `. ערוץ: ${context.channelContext}` : ""}${context.packetContext ? `. חבילה: ${context.packetContext}` : ""}${context.nodeText ? `. הנחיית צומת: ${context.nodeText}` : ""}`,
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
      return { text, outcome: detectOutcome(text + " " + userMessage) };
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
  if (lower.includes("לא מעוניין") || lower.includes("לא רוצה")) {
    return { text: "אני מבינה, תודה על זמנך. יום נעים!", outcome: "refused" };
  }
  return {
    text: context.isOpeningTurn ? context.stagePrompt : context.stagePrompt,
  };
}

export function detectOutcome(text: string): LlmResponse["outcome"] {
  const lower = text.toLowerCase();
  if (lower.includes("לא מעוניין") || lower.includes("אל תתקשר") || lower.includes("סירוב")) {
    return "refused";
  }
  if (lower.includes("חוזרים") || lower.includes("מאוחר יותר") || lower.includes("callback")) {
    return "callback";
  }
  if (lower.includes("מסכים") || lower.includes("רוצה לרכוש") || lower.includes("סגור")) {
    return "sold";
  }
  return null;
}
