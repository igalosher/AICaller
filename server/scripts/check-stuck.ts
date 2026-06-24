import { prisma } from "../src/db.js";

const contacts = await prisma.contact.findMany({ where: { status: "in_call" } });
const calls = await prisma.call.findMany({
  where: { status: { in: ["connected", "dialing", "ringing"] } },
  include: { contact: true },
});
console.log(
  "in_call contacts",
  contacts.map((c) => ({ id: c.id, name: c.firstName })),
);
console.log(
  "active calls",
  calls.map((c) => ({
    id: c.id,
    status: c.status,
    ext: c.externalCallId,
    contact: c.contact.firstName,
    startedAt: c.startedAt,
  })),
);
await prisma.$disconnect();
