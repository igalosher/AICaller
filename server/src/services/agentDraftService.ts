import { prisma } from "../db.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  createAgentExample,
  getAgentConfig,
  saveAgentConfig,
  type AgentConfig,
} from "./agentConfigService.js";

export type ConfigPatchField = "missionHe" | "limitsHe" | "policiesHe";

export type AgentDraftKind = "response_example" | "config_patch";

export interface CreateAgentDraftInput {
  customerText?: string;
  aiResponseBad?: string;
  correctedText?: string;
  configField?: ConfigPatchField;
  patchText?: string;
  callId?: string;
  segmentId?: string;
  operatorNote?: string;
}

export interface ResponseExamplePayload {
  customerText: string;
  aiResponseBad?: string | null;
  correctedText: string;
}

export interface ConfigPatchPayload {
  field: ConfigPatchField;
  appendText: string;
}

function applyConfigPatch(config: AgentConfig, field: ConfigPatchField, appendText: string): AgentConfig {
  const current = config[field];
  const merged = current.trim() ? `${current.trim()}\n${appendText.trim()}` : appendText.trim();
  return { ...config, [field]: merged };
}

export async function createAgentDrafts(input: CreateAgentDraftInput) {
  const created = [];
  if (input.correctedText?.trim()) {
    const row = await prisma.agentInstructionDraft.create({
      data: {
        kind: "response_example",
        payloadJson: JSON.stringify({
          customerText: input.customerText?.trim() || "(הקשר לא זמין)",
          aiResponseBad: input.aiResponseBad?.trim() || null,
          correctedText: input.correctedText.trim(),
        } satisfies ResponseExamplePayload),
        callId: input.callId ?? null,
        segmentId: input.segmentId ?? null,
        operatorNote: input.operatorNote?.trim() || null,
      },
    });
    created.push(row);
  }
  if (input.configField && input.patchText?.trim()) {
    const row = await prisma.agentInstructionDraft.create({
      data: {
        kind: "config_patch",
        payloadJson: JSON.stringify({
          field: input.configField,
          appendText: input.patchText.trim(),
        } satisfies ConfigPatchPayload),
        callId: input.callId ?? null,
        segmentId: input.segmentId ?? null,
        operatorNote: input.operatorNote?.trim() || null,
      },
    });
    created.push(row);
  }
  if (created.length === 0) {
    throw new AppError(400, "יש לספק תגובה מתוקנת או עדכון הנחיות");
  }
  return created;
}

export async function listPendingAgentDrafts(limit = 50) {
  return prisma.agentInstructionDraft.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function approveAgentDraft(id: string) {
  const draft = await prisma.agentInstructionDraft.findUnique({ where: { id } });
  if (!draft) throw new AppError(404, "טיוטה לא נמצאה");
  if (draft.status !== "pending") throw new AppError(400, "הטיוטה כבר טופלה");

  if (draft.kind === "response_example") {
    const payload = JSON.parse(draft.payloadJson) as ResponseExamplePayload;
    await createAgentExample({
      customerText: payload.customerText,
      aiResponseBad: payload.aiResponseBad ?? undefined,
      correctedText: payload.correctedText,
      callId: draft.callId ?? undefined,
      segmentId: draft.segmentId ?? undefined,
    });
  } else if (draft.kind === "config_patch") {
    const payload = JSON.parse(draft.payloadJson) as ConfigPatchPayload;
    const current = await getAgentConfig();
    const merged = applyConfigPatch(current, payload.field, payload.appendText);
    await saveAgentConfig(merged, {
      source: "draft_approval",
      label: `אישור טיוטה: ${payload.field}`,
    });
  } else {
    throw new AppError(400, "סוג טיוטה לא נתמך");
  }

  return prisma.agentInstructionDraft.update({
    where: { id },
    data: { status: "approved" },
  });
}

export async function discardAgentDraft(id: string) {
  const draft = await prisma.agentInstructionDraft.findUnique({ where: { id } });
  if (!draft) throw new AppError(404, "טיוטה לא נמצאה");
  if (draft.status !== "pending") throw new AppError(400, "הטיוטה כבר טופלה");
  return prisma.agentInstructionDraft.update({
    where: { id },
    data: { status: "discarded" },
  });
}
