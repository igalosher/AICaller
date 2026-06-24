import type { Edge, Node } from "@xyflow/react";

const NODE_WIDTH = 220;
const MIN_NODE_HEIGHT = 56;
const H_GAP = 100;
const V_GAP = 80;
const MARGIN = 40;
const CHARS_PER_LINE = 20;
const LINE_HEIGHT_TYPE = 22;
const LINE_HEIGHT_LABEL = 16;
const LINE_HEIGHT_TEXT = 15;
const PAD_Y = 16;

type NodeData = { label?: string; nodeType?: string; text?: string };

function wrappedLineCount(text: string): number {
  if (!text) return 0;
  return text
    .split(/\r?\n/)
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / CHARS_PER_LINE)), 0);
}

/** Mirror FlowNodeCard sizing so layout rows clear tall speak nodes. */
export function estimateNodeHeight(node: Node): number {
  const data = (node.data ?? {}) as NodeData;
  const typeH = LINE_HEIGHT_TYPE;
  const labelLines = Math.max(1, wrappedLineCount(String(data.label ?? "")));
  const labelH = labelLines * LINE_HEIGHT_LABEL;
  const textLines = data.text ? wrappedLineCount(String(data.text)) : 0;
  const textH = textLines > 0 ? 4 + textLines * LINE_HEIGHT_TEXT : 0;
  return Math.max(MIN_NODE_HEIGHT, PAD_Y + typeH + labelH + textH + 12);
}

function buildAdjacency(
  nodes: Node[],
  edges: Edge[],
): {
  children: Map<string, string[]>;
  parents: Map<string, string[]>;
} {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();

  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    const out = children.get(e.source) ?? [];
    if (!out.includes(e.target)) out.push(e.target);
    children.set(e.source, out);

    const inn = parents.get(e.target) ?? [];
    if (!inn.includes(e.source)) inn.push(e.source);
    parents.set(e.target, inn);
  }

  return { children, parents };
}

/**
 * Assign layers via BFS from root (each node visited once — safe on cycles).
 */
function assignLayers(
  rootId: string,
  children: Map<string, string[]>,
  nodeIds: Set<string>,
): { layers: Map<string, number>; order: Map<string, number> } {
  const layers = new Map<string, number>();
  const order = new Map<string, number>();
  const visited = new Set<string>();
  let seq = 0;

  layers.set(rootId, 0);
  visited.add(rootId);
  order.set(rootId, seq++);
  const queue = [rootId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const base = layers.get(id) ?? 0;
    for (const child of children.get(id) ?? []) {
      if (visited.has(child)) continue;
      visited.add(child);
      layers.set(child, base + 1);
      order.set(child, seq++);
      queue.push(child);
    }
  }

  let nextLayer = Math.max(0, ...layers.values()) + 1;
  for (const id of nodeIds) {
    if (!layers.has(id)) {
      layers.set(id, nextLayer++);
      order.set(id, seq++);
    }
  }

  return { layers, order };
}

function layerMaxHeight(layerIds: string[], nodeById: Map<string, Node>): number {
  let maxH = MIN_NODE_HEIGHT;
  for (const id of layerIds) {
    const node = nodeById.get(id);
    if (node) maxH = Math.max(maxH, estimateNodeHeight(node));
  }
  return maxH;
}

/**
 * Layered column layout with row Y derived from the tallest node in each preceding row.
 */
export function layoutFlowNodes(nodes: Node[], edges: Edge[], startNodeId: string): Node[] {
  if (nodes.length === 0) return nodes;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const rootId = nodeIds.has(startNodeId) ? startNodeId : nodes[0]!.id;
  const { children } = buildAdjacency(nodes, edges);
  const { layers, order } = assignLayers(rootId, children, nodeIds);

  const byLayer = new Map<number, string[]>();
  for (const id of nodeIds) {
    const layer = layers.get(id) ?? 0;
    const list = byLayer.get(layer) ?? [];
    list.push(id);
    byLayer.set(layer, list);
  }

  const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);
  const layerY = new Map<number, number>();
  let yCursor = 0;
  for (const layer of sortedLayers) {
    layerY.set(layer, yCursor);
    const ids = byLayer.get(layer) ?? [];
    yCursor += layerMaxHeight(ids, nodeById) + V_GAP;
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [layer, ids] of byLayer) {
    const sorted = [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    const y = layerY.get(layer) ?? 0;
    sorted.forEach((id, col) => {
      positions.set(id, {
        x: col * (NODE_WIDTH + H_GAP),
        y,
      });
    });
  }

  let minX = Infinity;
  let minY = Infinity;
  for (const pos of positions.values()) {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
  }
  const shiftX = MARGIN - (Number.isFinite(minX) ? minX : 0);
  const shiftY = MARGIN - (Number.isFinite(minY) ? minY : 0);

  return nodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 };
    return {
      ...n,
      position: { x: pos.x + shiftX, y: pos.y + shiftY },
      style: { width: NODE_WIDTH, ...n.style },
    };
  });
}
