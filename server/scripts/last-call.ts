import { prisma } from "../src/db.js";

const call = await prisma.call.findFirst({
  orderBy: { startedAt: "desc" },
  include: {
    transcript: {
      orderBy: { timestamp: "asc" },
      include: { classification: { include: { intent: true } } },
    },
    contact: true,
  },
});

if (!call) {
  console.log("no calls");
} else {
  console.log(
    JSON.stringify(
      {
        id: call.id,
        status: call.status,
        externalCallId: call.externalCallId,
        currentNodeId: call.currentNodeId,
        currentStage: call.currentStage,
        contextJson: call.contextJson,
        transcript: call.transcript.map((t) => ({
          speaker: t.speaker,
          text: t.text,
          intent: t.classification?.intentId,
          confidence: t.classification?.confidence,
          classifier: t.classification?.classifier,
        })),
      },
      null,
      2,
    ),
  );
}

await prisma.$disconnect();
