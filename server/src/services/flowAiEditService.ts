import { prisma } from "../db.js";
import { AppError } from "../middleware/errorHandler.js";
import { enhanceSigalGraph } from "../flow/sigalMiniFlow.js";
import { normalizeFlowGraph } from "../flow/graphFlowEngine.js";
import { validateFlowGraph } from "../flow/graphValidation.js";
import {
  applyFlowGraphPatch,
  type FlowGraphPatch,
  type FlowPatchOperation,
} from "../flow/flowGraphPatch.js";
import type { FlowGraph } from "../flow/graphTypes.js";
import { getAiConfig } from "./settingsService.js";
import { getActiveCallFlow } from "./callFlowService.js";
import { saveDraftGraph } from "./flowGraphService.js";
import { logger } from "../logger.js";

const OFF_TOPIC_PATTERNS = [
  "מזג האוויר",
  "מזג אוויר",
  "openai",
  "api key",
  "מפתח",
  "הגדרות",
  "אנשי קשר",
  "שיחות",
  "חשבון",
  "billing",
];

const SYSTEM_PROMPT = `את עוזרת לעריכת זרימת שיחה (flow graph) של מערכת YES בעברית.
המשתמש מבקש שינויים בגרף בלבד: צמתים (speak/listen/decision/intent_route/end), קשתות, ניסוח דיבור, משתנים, קישורי האזנה, זרימות צד.
אסור לענות על נושאים מחוץ לזרימה (מזג אוויר, הגדרות מערכת, אנשי קשר, שיחות).
החזירי JSON בלבד בפורמט:
{
  "refused": false,
  "refusalHe": "",
  "summaryHe": "תיאור קצר בעברית של מה שינית",
  "operations": [ ... ]
}
אם הבקשה מחוץ לתחום — refused: true, refusalHe בעברית, operations: [].
פעולות מותרות:
- addNode { node }
- updateNode { id, patch }
- deleteNode { id }
- addEdge { edge } — edge חייב id ייחודי
- updateEdge { id, patch }
- deleteEdge { id }
- updateSpeakText { nodeId, text }
- setVariable { variable }
- addVariableBinding { binding }
- addSideFlow { sideFlow }
שלב speak→listen→intent_route לשאלה חדשה. השתמשי ב-intentId קיימים מהרשימה.`;

export function isObviouslyOffTopic(message: string): boolean {
  const norm = message.trim().toLowerCase();
  return OFF_TOPIC_PATTERNS.some((p) => norm.includes(p));
}

function summarizeGraph(graph: FlowGraph): string {
  const nodes = graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    label: n.label,
    text: n.type === "speak" ? (n.text ?? "").slice(0, 120) : undefined,
  }));
  const edges = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    intentId: e.intentId,
    isDefault: e.isDefault,
  }));
  return JSON.stringify({
    startNodeId: graph.startNodeId,
    nodes,
    edges,
    variables: graph.variables ?? [],
    variableBindings: graph.variableBindings ?? [],
    sideFlows: graph.sideFlows ?? [],
  });
}

async function callFlowEditLlm(
  message: string,
  graphSummary: string,
  intents: { id: string; labelHe: string }[],
): Promise<FlowGraphPatch> {
  const config = await getAiConfig();
  if (!config.openaiApiKey) {
    throw new AppError(503, "OpenAI לא מוגדר — הוסף מפתח בהגדרות");
  }

  const intentList = intents.map((i) => `${i.id}: ${i.labelHe}`).join(", ");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `גרף נוכחי:\n${graphSummary}\n\nכוונות זמינות: ${intentList}\n\nבקשת המשתמש: ${message}`,
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.warn({ status: res.status, body: body.slice(0, 300) }, "Flow AI edit LLM failed");
    throw new AppError(502, "שגיאה בעוזר ה-AI — נסה שוב");
  }

  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const raw = data.choices[0]?.message?.content ?? "{}";
  let parsed: FlowGraphPatch;
  try {
    parsed = JSON.parse(raw) as FlowGraphPatch;
  } catch {
    throw new AppError(502, "תשובת AI לא תקינה — נסה לנסח מחדש");
  }
  parsed.operations = parsed.operations ?? [];
  return parsed;
}

function ruleBasedPatch(message: string, graph: FlowGraph): FlowGraphPatch | null {
  const norm = message.trim();
  const shortenMatch = norm.match(/קצר|קצרה|קצרי/);
  const tvSpeak =
    graph.nodes.find((n) => n.id.includes("tv") && n.type === "speak") ??
    graph.nodes.find(
      (n) =>
        n.type === "speak" &&
        typeof (n as { text?: string }).text === "string" &&
        /טלוויז|טלויז/i.test((n as { text: string }).text),
    );
  if (shortenMatch && tvSpeak?.type === "speak") {
    return {
      refused: false,
      summaryHe: "קיצרתי את ניסוח שאלת הטלוויזיות",
      operations: [
        {
          op: "updateSpeakText",
          nodeId: tvSpeak.id,
          text: "כמה טלוויזיות יש בבית?",
        },
      ],
    };
  }
  return null;
}

export interface FlowAiEditResult {
  draftGraph: FlowGraph;
  summaryHe: string;
  affectedNodeIds: string[];
}

export async function editFlowWithAi(
  message: string,
  draftGraph: FlowGraph,
): Promise<FlowAiEditResult> {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new AppError(400, "הזן בקשה לעריכת הזרימה");
  }

  if (isObviouslyOffTopic(trimmed)) {
    throw new AppError(
      400,
      "אני עוזרת רק לעריכת זרימת השיחה — צמתים, קשתות וניסוח. נסחי בקשה על הזרימה.",
    );
  }

  const intents = await prisma.intent.findMany({
    where: { active: true },
    select: { id: true, labelHe: true },
  });

  let patch =
    ruleBasedPatch(trimmed, draftGraph) ??
    (await callFlowEditLlm(trimmed, summarizeGraph(draftGraph), intents));

  if (patch.refused) {
    throw new AppError(400, patch.refusalHe || "הבקשה מחוץ לתחום עריכת הזרימה");
  }

  if (!patch.operations?.length) {
    throw new AppError(400, "לא זוהו שינויים בזרימה — נסחי בקשה ברורה יותר");
  }

  const { graph: patched, affectedNodeIds } = applyFlowGraphPatch(draftGraph, patch);
  const enhanced = enhanceSigalGraph(normalizeFlowGraph(patched));
  const errors = validateFlowGraph(enhanced);
  if (errors.length > 0) {
    throw new AppError(400, errors.map((e) => e.messageHe).join("; "));
  }

  const flow = await getActiveCallFlow();
  if (!flow) throw new AppError(404, "אין זרימה פעילה");
  const saved = await saveDraftGraph(flow.id, enhanced);

  return {
    draftGraph: saved,
    summaryHe: patch.summaryHe || "הזרימה עודכנה",
    affectedNodeIds,
  };
}

export function parseFlowPatchOperations(raw: unknown): FlowPatchOperation[] {
  if (!Array.isArray(raw)) return [];
  return raw as FlowPatchOperation[];
}
