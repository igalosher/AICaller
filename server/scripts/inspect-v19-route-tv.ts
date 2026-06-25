import { prisma } from "../src/db.js";

const v19 = await prisma.callFlow.findFirst({ where: { version: 19 } });
const g = JSON.parse(v19!.publishedGraphJson);

const routeTv = g.edges.filter((e: { source: string }) => e.source === "route_tv");
console.log("route_tv edges:");
for (const e of routeTv) {
  console.log(`  ${e.intentId ?? (e.isDefault ? "default" : "?")} -> ${e.target}`);
}

await prisma.$disconnect();
