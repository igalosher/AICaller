import { prisma } from "../src/db.js";

const v19 = await prisma.callFlow.findFirst({ where: { version: 19 } });
const g = JSON.parse(v19!.publishedGraphJson);

console.log("sideFlows:", JSON.stringify(g.sideFlows, null, 2));
console.log("interruptQa:", g.interruptQa);

const optOut = g.edges.filter((e: { intentId?: string }) => e.intentId === "opt_out_remove");
console.log("\nopt_out edges:", optOut);

const blacklist = g.edges.filter(
  (e: { target: string }) => e.target === "goodbye_blacklist",
);
console.log("\n-> goodbye_blacklist:", blacklist.map((e: { source: string; intentId?: string }) => `${e.source} ${e.intentId ?? ""}`));

await prisma.$disconnect();
