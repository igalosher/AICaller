import { prisma } from "../src/db.js";

const v19 = await prisma.callFlow.findFirst({ where: { version: 19 } });
if (!v19) throw new Error("v19 missing");

const g = JSON.parse(v19.publishedGraphJson);
const speakNodes = g.nodes.filter((n: { type: string }) => n.type === "speak");
console.log("startNodeId:", g.startNodeId);
console.log(
  "speak nodes:",
  speakNodes.map((n: { id: string }) => n.id),
);
console.log("\nopening full text:\n", g.nodes.find((n: { id: string }) => n.id === "speak_opening")?.text);
console.log("\nhas speak_tv:", g.nodes.some((n: { id: string }) => n.id === "speak_tv"));
console.log("has listen_tv:", g.nodes.some((n: { id: string }) => n.id === "listen_tv"));
console.log("has listen_opening:", g.nodes.some((n: { id: string }) => n.id === "listen_opening"));

const openingOut = g.edges.filter((e: { source: string }) => e.source === "speak_opening");
console.log("\nspeak_opening out:", openingOut);

const routeOpeningOut = g.edges.filter((e: { source: string }) => e.source === "route_opening");
console.log("\nroute_opening out:", routeOpeningOut.map((e: { intentId?: string; target: string; isDefault?: boolean }) => `${e.intentId ?? (e.isDefault ? "default" : "?")} -> ${e.target}`));

const listenTvIn = g.edges.filter((e: { target: string }) => e.target === "listen_tv");
console.log("\nedges to listen_tv:", listenTvIn);

await prisma.$disconnect();
