import type { ContactSex } from "@prisma/client";
import { logger } from "../logger.js";
import { timed } from "../voice/metrics.js";
import { getAiConfig } from "../services/settingsService.js";
import { productTools } from "../services/productKnowledge.js";
import { genderPromptHint } from "../utils/genderHebrew.js";
import { detectOutcome } from "../voice/llm.js";
import type { AgentConfig } from "../services/agentConfigService.js";
import type { AgentResponseExample } from "@prisma/client";

export interface AgentMemory {
  rejectionCount: number;
  tvCount?: number | null;
  internetType?: string | null;
  address?: string | null;
  lastTopic?: string | null;
}

export interface AgentReplyResult {
  text: string;
  outcome?: "sold" | "refused" | "callback" | null;
  memoryUpdates?: Partial<AgentMemory>;
}

export function parseAgentMemory(contextJson: string): AgentMemory {
  try {
    const parsed = JSON.parse(contextJson) as { agent?: AgentMemory };
    return {
      rejectionCount: parsed.agent?.rejectionCount ?? 0,
      tvCount: parsed.agent?.tvCount ?? null,
      internetType: parsed.agent?.internetType ?? null,
      address: parsed.agent?.address ?? null,
      lastTopic: parsed.agent?.lastTopic ?? null,
    };
  } catch {
    return { rejectionCount: 0 };
  }
}

export function serializeAgentContext(memory: AgentMemory): string {
  return JSON.stringify({ agent: memory });
}

function formatExamples(examples: AgentResponseExample[]): string {
  if (examples.length === 0) return "";
  return examples
    .map(
      (ex, i) =>
        `${i + 1}. לקוח: "${ex.customerText}"${ex.aiResponseBad ? ` | תגובה שגויה: "${ex.aiResponseBad}"` : ""} → תגובה מומלצת: "${ex.correctedText}"`,
    )
    .join("\n");
}

function isClearRejection(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("לא מעוניין") ||
    lower.includes("לא רוצה") ||
    lower.includes("תפסיקי") ||
    lower.includes("די תודה") ||
    lower.includes("אל תתקשרו")
  );
}

export async function generateAgentReply(
  userMessage: string,
  opts: {
    config: AgentConfig;
    customerFirstName: string;
    customerSex?: ContactSex;
    memory: AgentMemory;
    examples: AgentResponseExample[];
    transcriptLines: { speaker: string; text: string }[];
    isOpening?: boolean;
    isSilence?: boolean;
  },
): Promise<AgentReplyResult> {
  if (opts.isSilence) {
    const lastAi = [...opts.transcriptLines].reverse().find((l) => l.speaker === "ai");
    if (lastAi?.text) {
      return { text: lastAi.text, memoryUpdates: {} };
    }
    return { text: "אשמח לחזור על השאלה — אפשר לענות?", memoryUpdates: {} };
  }

  const outcomeFromRules = detectOutcome(userMessage);
  if (userMessage.includes("הסר")) {
    return { text: "תודה רבה ויום נעים.", outcome: "refused", memoryUpdates: {} };
  }

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
  ].join(". ");

  const examplesBlock = formatExamples(opts.examples);
  const history = opts.transcriptLines
    .slice(-8)
    .map((l) => `${l.speaker === "ai" ? "סיגל" : "לקוח"}: ${l.text}`)
    .join("\n");

  const memoryLine = `זיכרון שיחה: סירובים=${opts.memory.rejectionCount}, טלוויזיות=${opts.memory.tvCount ?? "?"}, אינטרנט=${opts.memory.internetType ?? "?"}, כתובת=${opts.memory.address ?? "?"}`;

  const system = [
    "את סיגל, עוזרת דיגיטלית מ-YES בשיחת מכירה יוצאת בעברית — את התקשרת ללקוח, אל תנסחי כאילו הוא פנה אליך.",
    `משימה:\n${opts.config.missionHe}`,
    `מגבלות קשיחות:\n${opts.config.limitsHe}`,
    `מדיניות:\n${opts.config.policiesHe}`,
    productContext,
    memoryLine,
    examplesBlock ? `דוגמאות מאושרות ממפעילים:\n${examplesBlock}` : "",
    "השיבי בקצרה (1-3 משפטים). אל תחזרי על הצגה עצמית אחרי הפתיחה.",
    genderPromptHint(opts.customerSex ?? "male"),
  ]
    .filter(Boolean)
    .join("\n\n");

  const userContent = opts.isOpening
    ? `פתיחת שיחה לפי התבנית (התאימי שם): ${opts.config.openingTemplateHe.replace("{{customer_full_name}}", opts.customerFirstName)}`
    : `היסטוריה אחרונה:\n${history || "(אין)"}\n\nהודעת הלקוח האחרונה: ${userMessage}`;

  if (!config.openaiApiKey) {
    return fallbackAgentReply(userMessage, opts);
  }

  try {
    return await timed("agent_llm_round_trip", undefined, async () => {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: system },
            { role: "user", content: userContent },
          ],
          temperature: opts.isOpening ? 0.4 : 0.35,
        }),
      });

      if (!res.ok) {
        logger.warn({ status: res.status }, "Agent OpenAI request failed");
        return fallbackAgentReply(userMessage, opts);
      }

      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      const text = data.choices[0]?.message?.content?.trim() ?? "אשמח לעזור. אפשר לחזור על השאלה?";

      const memoryUpdates: Partial<AgentMemory> = {};
      if (isClearRejection(userMessage)) {
        memoryUpdates.rejectionCount = opts.memory.rejectionCount + 1;
      }
      const tvMatch = userMessage.match(/(\d+|אחת|אחד|שתיים|שניים|שלוש|ארבע|חמש)/);
      if (tvMatch && !opts.memory.tvCount) {
        const map: Record<string, number> = { אחת: 1, אחד: 1, שתיים: 2, שניים: 2, שלוש: 3, ארבע: 4, חמש: 5 };
        memoryUpdates.tvCount = map[tvMatch[1]!] ?? (parseInt(tvMatch[1]!, 10) || null);
      }
      if (/סיבים|רגיל|לא יודע|אין לי אינטרנט/.test(userMessage) && !opts.memory.internetType) {
        if (userMessage.includes("סיבים")) memoryUpdates.internetType = "fiber";
        else if (userMessage.includes("רגיל")) memoryUpdates.internetType = "regular";
        else memoryUpdates.internetType = "unknown";
      }

      let outcome = outcomeFromRules;
      if ((memoryUpdates.rejectionCount ?? opts.memory.rejectionCount) >= opts.config.maxRejections) {
        outcome = "refused";
      }

      return { text, outcome, memoryUpdates };
    });
  } catch (err) {
    logger.error({ err }, "generateAgentReply failed");
    return fallbackAgentReply(userMessage, opts);
  }
}

function fallbackAgentReply(
  userMessage: string,
  opts: { config: AgentConfig; memory: AgentMemory; isOpening?: boolean },
): AgentReplyResult {
  if (opts.isOpening) {
    return {
      text: opts.config.openingTemplateHe.replace("{{customer_full_name}}", "לקוח/ה"),
    };
  }
  if (isClearRejection(userMessage)) {
    const count = opts.memory.rejectionCount + 1;
    if (count >= opts.config.maxRejections) {
      return { text: "הבנתי, תודה על זמנך. יום נעים!", outcome: "refused", memoryUpdates: { rejectionCount: count } };
    }
    return { text: "הבנתי. רק רגע — אולי יש משהו קטן שיכול להתאים?", memoryUpdates: { rejectionCount: count } };
  }
  return { text: "כמה טלוויזיות יש בבית? כך אוכל להציע חבילה שמתאימה." };
}
