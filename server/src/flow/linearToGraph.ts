import type { CallFlowData } from "../services/callFlowService.js";
import type { FlowGraph } from "./graphTypes.js";

export function linearFlowToGraph(data: CallFlowData): FlowGraph {
  const nodes: FlowGraph["nodes"] = [];
  const edges: FlowGraph["edges"] = [];

  nodes.push({
    id: "opening",
    type: "speak",
    label: "פתיחה",
    text: data.openingTemplate,
    position: { x: 250, y: 0 },
  });

  let prevId = "opening";
  let y = 120;

  for (const stage of data.stages) {
    const listenId = `listen_${stage.id}`;
    const routeId = `route_${stage.id}`;
    const speakId = `speak_${stage.id}`;

    nodes.push(
      { id: listenId, type: "listen", label: `האזנה ${stage.id}`, position: { x: 250, y } },
      { id: routeId, type: "intent_route", label: `ניתוב ${stage.id}`, position: { x: 250, y: y + 120 } },
      {
        id: speakId,
        type: "speak",
        label: stage.id,
        text: stage.prompt,
        useLlm: true,
        position: { x: 250, y: y + 240 },
      },
    );

    edges.push({ id: `e_${prevId}_${listenId}`, source: prevId, target: listenId });
    edges.push({ id: `e_${listenId}_${routeId}`, source: listenId, target: routeId });

    const objectionEntries = Object.entries(data.objections);
    let ox = 0;
    for (const [key, text] of objectionEntries) {
      const objId = `obj_${stage.id}_${key}`;
      nodes.push({
        id: objId,
        type: "speak",
        label: key,
        text,
        useLlm: true,
        position: { x: ox, y: y + 360 },
      });
      edges.push({
        id: `e_${routeId}_${objId}`,
        source: routeId,
        target: objId,
        intentId: key,
        label: key,
      });
      edges.push({ id: `e_${objId}_${speakId}`, source: objId, target: speakId });
      ox += 200;
    }

    edges.push({
      id: `e_${routeId}_${speakId}_default`,
      source: routeId,
      target: speakId,
      isDefault: true,
      label: "ברירת מחדל",
    });

    prevId = speakId;
    y += 480;
  }

  nodes.push({
    id: "end",
    type: "end",
    label: "סיום",
    outcome: "none",
    position: { x: 250, y },
  });
  edges.push({ id: "e_end", source: prevId, target: "end" });

  return { startNodeId: "opening", nodes, edges };
}
