import { prisma } from "./db.js";
import { refreshProductKnowledge } from "./services/productKnowledge.js";
import { ensureYesCatalogSeeded } from "./services/yesCatalogService.js";
import { seedDefaultIntents } from "./services/intentService.js";
import { migrateToSigalMiniFlowIfNeeded, patchActiveFlowEnhancements } from "./services/flowGraphService.js";
import { backfillAgentConfigVersionIfEmpty, patchAgentConfigOutboundSalesIfNeeded } from "./services/agentConfigService.js";
import { createSigalMiniFlowGraph, STAGED_OPENING } from "./flow/sigalMiniFlow.js";

export async function runSeed() {
  await seedDefaultIntents();

  const contactCount = await prisma.contact.count();
  if (contactCount === 0) {
    await prisma.contact.createMany({
      data: [
        { firstName: "דוד", familyName: "כהן", phone: "0501234567", status: "pending" },
        { firstName: "שרה", familyName: "לוי", phone: "0527654321", status: "pending" },
        { firstName: "יוסי", familyName: "מזרחי", phone: "0541112233", status: "callback" },
      ],
    });
  }

  await ensureYesCatalogSeeded();
  const flowCount = await prisma.callFlow.count();
  if (flowCount === 0) {
    const graph = createSigalMiniFlowGraph();
    await prisma.callFlow.create({
      data: {
        version: 1,
        openingTemplate: STAGED_OPENING,
        stagesJson: "[]",
        objectionsJson: "{}",
        draftGraphJson: JSON.stringify(graph),
        publishedGraphJson: JSON.stringify(graph),
        graphPublishedAt: new Date(),
        isActive: true,
      },
    });
  } else {
    await migrateToSigalMiniFlowIfNeeded();
    await patchActiveFlowEnhancements();
  }

  await refreshProductKnowledge();
  await backfillAgentConfigVersionIfEmpty();
  await patchAgentConfigOutboundSalesIfNeeded();
}

const isMain =
  import.meta.url === new URL(process.argv[1] ?? "", "file:").href ||
  process.argv[1]?.replace(/\\/g, "/").endsWith("/seed.ts");

if (isMain) {
  runSeed()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error(err);
      prisma.$disconnect().finally(() => process.exit(1));
    });
}
