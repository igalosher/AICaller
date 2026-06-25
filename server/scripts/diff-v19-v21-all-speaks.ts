import { prisma } from "../src/db.js";

const v19 = await prisma.callFlow.findFirst({ where: { version: 19 } });
const v21 = await prisma.callFlow.findFirst({ where: { version: 21 } });
const g19 = JSON.parse(v19!.publishedGraphJson);
const g21 = JSON.parse(v21!.publishedGraphJson);

const ids = [
  "speak_opening",
  "speak_inet",
  "speak_address",
  "speak_fiber_yes",
  "speak_fiber_no",
  "speak_no_inet",
  "speak_speed_fiber",
  "speak_speed_reg",
  "speak_provider",
  "speak_price",
  "speak_offer",
  "speak_addons",
  "speak_summary",
  "speak_callback",
];

for (const id of ids) {
  const t19 = g19.nodes.find((n: { id: string }) => n.id === id)?.text;
  const t21 = g21.nodes.find((n: { id: string }) => n.id === id)?.text;
  if (t19 !== t21) {
    console.log("\n==== DIFF", id, "====");
    console.log("v19:", t19 ?? "(missing)");
    console.log("v21:", t21 ?? "(missing)");
  }
}

await prisma.$disconnect();
