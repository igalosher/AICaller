import { prisma } from "../src/db.js";

const flows = await prisma.callFlow.findMany({
  orderBy: { version: "desc" },
  take: 10,
  select: {
    id: true,
    version: true,
    isActive: true,
    graphPublishedAt: true,
    draftGraphJson: true,
    publishedGraphJson: true,
  },
});

for (const f of flows) {
  const json = f.publishedGraphJson !== "{}" ? f.publishedGraphJson : f.draftGraphJson;
  const g = JSON.parse(json);
  const opening = g.nodes?.find((n: { id: string }) => n.id === "speak_opening");
  const tv = g.nodes?.find((n: { id: string }) => n.id === "speak_tv");
  const inet = g.nodes?.find((n: { id: string }) => n.id === "speak_inet");
  console.log("\n=== v" + f.version, f.isActive ? "(ACTIVE)" : "", "===");
  console.log("nodes:", g.nodes?.length, "edges:", g.edges?.length);
  if (opening?.text) console.log("speak_opening:", opening.text.slice(0, 200));
  if (tv?.text) console.log("speak_tv:", tv.text.slice(0, 200));
  if (inet?.text) console.log("speak_inet:", inet.text.slice(0, 200));
}

await prisma.$disconnect();
