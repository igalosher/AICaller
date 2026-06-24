import { prisma } from "../src/db.js";
import { recoverStuckContacts } from "../src/services/callService.js";

await recoverStuckContacts();

const contacts = await prisma.contact.findMany({ where: { status: "in_call" } });
const calls = await prisma.call.findMany({
  where: { status: { in: ["connected", "dialing", "ringing"] } },
});
console.log("remaining in_call contacts:", contacts.length);
console.log("remaining active calls:", calls.length);
await prisma.$disconnect();
