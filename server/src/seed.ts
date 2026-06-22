import { prisma } from "./db.js";
import { refreshProductKnowledge } from "./services/productKnowledge.js";
import { createCallFlowVersion } from "./services/callFlowService.js";
import { ensureYesCatalogSeeded } from "./services/yesCatalogService.js";

export async function runSeed() {
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
    await createCallFlowVersion({
      openingTemplate:
        "שלום {{customer_name}}, מדברת נציגת YES. שיחה זו מוקלטת לצורכי איכות. יש לי הצעה מיוחדת עבורך היום.",
      stages: [
        {
          id: "greeting",
          prompt: "האם זה זמן נוח לשמוע על חבילות YES?",
          next: "qualification",
        },
        {
          id: "qualification",
          prompt: "האם אתה מעוניין בטלוויזיה, אינטרנט, או חבילה משולבת?",
          next: "pitch",
        },
        {
          id: "pitch",
          prompt: "יש לנו חבילת טריפל מצוינת החל מ-149 שקלים לחודש. היא כוללת ערוצי ספורט, ילדים, אינטרנט סיבים וטלפון.",
          next: "closing",
        },
        {
          id: "closing",
          prompt: "האם תרצה לסגור את העסקה היום ולקבל את כל הפרטים?",
          next: "closing",
        },
      ],
      objections: {
        price: "אני מבינה. יש לנו גם חבילות קטנות יותר החל מ-99 שקלים, ואפשר לשלב מבצעים.",
        not_interested: "אין בעיה, תודה על זמנך. אם תרצה בעתיד — אנחנו כאן.",
        callback: "בשמחה, מתי יהיה נוח לחזור אליך?",
      },
    });
  }

  await refreshProductKnowledge();
}
