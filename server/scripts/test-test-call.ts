import { prisma } from "../src/db.js";
import { startTestCall } from "../src/services/callService.js";

const contact = await prisma.contact.findFirst({ where: { deletedAt: null } });
if (!contact) {
  console.log("no contact");
  process.exit(1);
}
console.log("contact", contact.id, contact.status);
try {
  const call = await startTestCall(contact.id);
  console.log("success", call?.id, call?.externalCallId, call?.status);
} catch (e) {
  console.error("error", e);
}
await prisma.$disconnect();
