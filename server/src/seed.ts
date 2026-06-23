import { prisma } from "./db.js";
import { refreshProductKnowledge } from "./services/productKnowledge.js";
import { createCallFlowVersion } from "./services/callFlowService.js";
import { ensureYesCatalogSeeded } from "./services/yesCatalogService.js";
import { seedDefaultIntents } from "./services/intentService.js";
import { ensureStarterGraphPublished } from "./services/flowGraphService.js";
import { createDefaultStarterFlow } from "./flow/starterFlow.js";

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
    const starterGraph = createDefaultStarterFlow();
    await prisma.callFlow.create({
      data: {
        version: 1,
        openingTemplate:
          "שלום {{customer_full_name}}, מדברת נציגת YES. שיחה זו מוקלטת לצורכי איכות. יש לי הצעה מיוחדת עבורך היום.",
        stagesJson: JSON.stringify([
          { id: "greeting", prompt: "האם זה זמן נוח?", next: "pitch" },
          { id: "pitch", prompt: "חבילת טריפל מ-149 שקלים.", next: "closing" },
          { id: "closing", prompt: "לסגור היום?", next: "closing" },
        ]),
        objectionsJson: JSON.stringify({
          price_objection: "יש חבילות מ-99 שקלים.",
          not_interested: "תודה על זמנך.",
          callback: "מתי לחזור?",
        }),
        draftGraphJson: JSON.stringify(starterGraph),
        publishedGraphJson: JSON.stringify(starterGraph),
        graphPublishedAt: new Date(),
        isActive: true,
      },
    });
  } else {
    await ensureStarterGraphPublished();
  }

  await refreshProductKnowledge();
}
