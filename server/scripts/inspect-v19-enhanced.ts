import { prisma } from "../src/db.js";
import { enhanceSigalGraph } from "../src/flow/sigalMiniFlow.js";
import { normalizeFlowGraph } from "../src/flow/graphFlowEngine.js";
import { validateFlowGraph } from "../src/flow/graphValidation.js";

const v19 = await prisma.callFlow.findFirst({ where: { version: 19 } });
const g19 = JSON.parse(v19!.publishedGraphJson);
const enhanced = enhanceSigalGraph(normalizeFlowGraph(g19));

console.log("nodes", g19.nodes.length, "->", enhanced.nodes.length);
console.log("edges", g19.edges.length, "->", enhanced.edges.length);
console.log("has speak_tv:", enhanced.nodes.some((n) => n.id === "speak_tv"));
console.log("has listen_opening:", enhanced.nodes.some((n) => n.id === "listen_opening"));
console.log("has route_opening:", enhanced.nodes.some((n) => n.id === "route_opening"));
console.log("has speak_hi:", enhanced.nodes.some((n) => n.id === "speak_hi"));

const openingOut = enhanced.edges.filter((e) => e.source === "speak_opening");
console.log("\nspeak_opening out:", openingOut.map((e) => `${e.target}`));

const o = enhanced.nodes.find((n) => n.id === "speak_opening");
const inet = enhanced.nodes.find((n) => n.id === "speak_inet");
console.log("\nopening has nikud:", o?.type === "speak" && o.text.includes("סִגׇּל"));
console.log("opening has TV Q:", o?.type === "speak" && o.text.includes("טלויזיות"));
console.log("inet:", inet?.type === "speak" ? inet.text : "n/a");

const fiberYes = enhanced.edges.filter((e) => e.source === "speak_fiber_yes");
console.log("\nspeak_fiber_yes out:", fiberYes.map((e) => e.target));

const routeTv = enhanced.edges.filter((e) => e.source === "route_tv");
console.log("\nroute_tv out:", routeTv.map((e) => `${e.intentId ?? (e.isDefault ? "default" : "?")} -> ${e.target}`));

console.log("\nvalidation:", validateFlowGraph(enhanced).length);

await prisma.$disconnect();
