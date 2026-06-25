import { createSigalMiniFlowGraph, enhanceSigalGraph } from "../src/flow/sigalMiniFlow.js";

const g = enhanceSigalGraph(createSigalMiniFlowGraph());
const regDefault = g.edges.find((e) => e.source === "route_speed_reg" && e.isDefault);
const binding = g.variableBindings?.find((b) => b.listenNodeId === "listen_speed_reg");

console.assert(regDefault?.target === "speak_provider", `speed_reg default → ${regDefault?.target}`);
console.assert(binding?.variableName === "SpeedAnswerText", "speed binding");
console.log("Speed routing patch OK");
