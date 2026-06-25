import { prisma } from "../src/db.js";
import { getPublishedGraphForCall } from "../src/services/flowGraphService.js";

async function main() {
  const call = await prisma.call.findFirst({
    orderBy: { startedAt: "desc" },
    include: {
      callFlow: true,
      transcript: {
        orderBy: { timestamp: "asc" },
        include: { classification: true },
      },
    },
  });
  if (!call) {
    console.log("no calls");
    return;
  }

  console.log("CALL", call.id);
  console.log("status", call.status, "node", call.currentNodeId, "stage", call.currentStage);
  console.log("context", call.contextJson);

  console.log("\n--- TRANSCRIPT ---");
  for (const t of call.transcript) {
    const c = t.classification
      ? ` [${t.classification.intentId} ${t.classification.confidence}]`
      : "";
    console.log(`${t.speaker}: ${t.text.slice(0, 120)}${t.text.length > 120 ? "..." : ""}${c}`);
  }

  const graph = call.callFlow ? getPublishedGraphForCall(call.callFlow) : null;
  if (!graph) return;

  const fiberNodes = graph.nodes.filter(
    (n) =>
      n.id.includes("fiber") ||
      n.id.includes("address") ||
      (n.type === "speak" && (n as { text?: string }).text?.includes("סיבים")),
  );
  console.log("\n--- FIBER/ADDRESS NODES ---");
  for (const n of fiberNodes) {
    const out = graph.edges.filter((e) => e.source === n.id);
    const inn = graph.edges.filter((e) => e.target === n.id);
    console.log(n.id, n.type, "in:", inn.map((e) => `${e.source}(${e.intentId ?? ""})`), "out:", out.map((e) => `${e.target}(${e.intentId ?? ""})`));
    if (n.type === "speak") console.log("  text:", (n as { text: string }).text.slice(0, 100));
  }

  const nodeId = call.currentNodeId;
  if (nodeId) {
    const node = graph.nodes.find((n) => n.id === nodeId);
    const out = graph.edges.filter((e) => e.source === nodeId);
    console.log("\n--- CURRENT NODE ---", nodeId, node?.type, node?.label);
    console.log("outgoing:", out);
  }

  const listenFiberYes = graph.nodes.find((n) => n.id === "listen_fiber_yes");
  console.log("\nlisten_fiber_yes exists:", !!listenFiberYes);
  const fiberYesEdges = graph.edges.filter(
    (e) =>
      e.source === "speak_fiber_yes" ||
      e.target === "listen_fiber_yes" ||
      e.source === "listen_fiber_yes",
  );
  console.log("fiber_yes chain edges:", fiberYesEdges);
}

main().finally(() => prisma.$disconnect());
