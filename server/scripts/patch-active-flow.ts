import { patchActiveFlowEnhancements } from "../src/services/flowGraphService.js";
import { prisma } from "../src/db.js";

await patchActiveFlowEnhancements();
const flow = await prisma.callFlow.findFirst({
  where: { isActive: true },
  orderBy: { version: "desc" },
});
if (flow?.publishedGraphJson) {
  const g = JSON.parse(flow.publishedGraphJson);
  console.log("variables:", g.variables);
  console.log("bindings:", g.variableBindings);
  const inet = g.nodes.find((n: { id: string }) => n.id === "speak_inet");
  if (inet?.text) console.log("speak_inet:", inet.text.slice(0, 80));
}
await prisma.$disconnect();
