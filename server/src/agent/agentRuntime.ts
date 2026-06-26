import type { CallOutcome, Contact } from "@prisma/client";
import { prisma } from "../db.js";
import { contactFullName } from "../utils/name.js";
import {
  findRelevantAgentExamples,
  getAgentConfig,
  type AgentConfig,
} from "../services/agentConfigService.js";
import {
  generateAgentReply,
  parseAgentMemory,
  serializeAgentContext,
  type AgentMemory,
} from "./agentLlm.js";
import { detectOutcome } from "../voice/llm.js";

type VoiceTurnResult = { sayText: string; endCall: boolean; pendingOutcome?: CallOutcome };

export async function prepareAgentOpening(
  callId: string,
  contact: Contact,
): Promise<VoiceTurnResult> {
  const config = await getAgentConfig();
  const sayText = config.openingTemplateHe.replace(
    /\{\{customer_full_name\}\}/g,
    contactFullName(contact.firstName, contact.familyName),
  );

  await prisma.call.update({
    where: { id: callId },
    data: { contextJson: serializeAgentContext({ rejectionCount: 0 }) },
  });

  return { sayText, endCall: false };
}

export async function processAgentTurn(
  callId: string,
  text: string,
  contact: Contact,
): Promise<VoiceTurnResult> {
  const config = await getAgentConfig();
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { transcript: { orderBy: { timestamp: "asc" } } },
  });
  if (!call) return { sayText: "שגיאה.", endCall: true };

  const isSilence = text.trim() === "";
  const memory = parseAgentMemory(call.contextJson);
  const transcriptLines = call.transcript.map((t) => ({ speaker: t.speaker, text: t.text }));

  if (!isSilence) {
    const examples = await findRelevantAgentExamples(text);
    const reply = await generateAgentReply(text, {
      config,
      customerFirstName: contact.firstName,
      customerSex: contact.sex,
      memory,
      examples,
      transcriptLines,
    });

    const updatedMemory: AgentMemory = {
      ...memory,
      ...reply.memoryUpdates,
      rejectionCount: reply.memoryUpdates?.rejectionCount ?? memory.rejectionCount,
    };

    await prisma.call.update({
      where: { id: callId },
      data: { contextJson: serializeAgentContext(updatedMemory) },
    });

    const outcome = reply.outcome ?? detectOutcome(text);
    if (outcome === "refused" || updatedMemory.rejectionCount >= config.maxRejections) {
      const closing = outcome === "sold" ? reply.text : "תודה רבה ויום נעים.";
      return { sayText: closing, endCall: true, pendingOutcome: outcome === "sold" ? "sold" : "refused" };
    }
    if (outcome === "sold") {
      return { sayText: reply.text, endCall: true, pendingOutcome: "sold" };
    }
    if (outcome === "callback") {
      return { sayText: reply.text, endCall: true, pendingOutcome: "callback" };
    }

    return { sayText: reply.text, endCall: false };
  }

  // Silence timeout — repeat last AI question
  const examples = await findRelevantAgentExamples("");
  const reply = await generateAgentReply("", {
    config,
    customerFirstName: contact.firstName,
    customerSex: contact.sex,
    memory,
    examples,
    transcriptLines,
    isSilence: true,
  });

  return { sayText: reply.text, endCall: false };
}

export type { AgentConfig };
