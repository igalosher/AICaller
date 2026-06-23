import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { callFlowsApi } from "../api";
import type { FlowEdge, FlowGraph, FlowNode } from "../types";

const NODE_LABELS: Record<string, string> = {
  speak: "דיבור",
  listen: "האזנה",
  decision: "החלטה",
  intent_route: "ניתוב כוונה",
  end: "סיום",
};

function FlowNodeCard({ data }: { data: { label: string; nodeType: string; text?: string } }) {
  return (
    <div className="min-w-[140px] rounded-lg border-2 border-blue-300 bg-white px-3 py-2 text-sm shadow">
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold text-blue-700">{NODE_LABELS[data.nodeType] ?? data.nodeType}</div>
      <div className="text-xs text-slate-600">{data.label}</div>
      {data.text && <div className="mt-1 line-clamp-2 text-xs">{data.text}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { flowNode: FlowNodeCard };

function graphToReactFlow(graph: FlowGraph): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((n) => ({
    id: n.id,
    type: "flowNode",
    position: n.position ?? { x: 0, y: 0 },
    data: { label: n.label ?? n.id, nodeType: n.type, text: n.type === "speak" ? n.text : undefined },
  }));
  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label ?? e.intentId ?? (e.isDefault ? "ברירת מחדל" : ""),
  }));
  return { nodes, edges };
}

function reactFlowToGraph(
  nodes: Node[],
  edges: Edge[],
  startNodeId: string,
  rawNodes: FlowNode[],
): FlowGraph {
  const rawMap = new Map(rawNodes.map((n) => [n.id, n]));
  const flowNodes: FlowNode[] = nodes.map((n) => {
    const existing = rawMap.get(n.id);
    const base = existing ?? {
      id: n.id,
      type: "speak" as const,
      label: String(n.data.label ?? n.id),
      text: "",
    };
    return { ...base, position: n.position, label: String(n.data.label ?? base.label) };
  });
  const flowEdges: FlowEdge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: typeof e.label === "string" ? e.label : undefined,
    intentId: typeof e.label === "string" && e.label.startsWith("intent:") ? e.label.slice(7) : undefined,
    isDefault: e.label === "ברירת מחדל",
  }));
  return { startNodeId, nodes: flowNodes, edges: flowEdges };
}

export function FlowBuilderPage() {
  const qc = useQueryClient();
  const { data: flow } = useQuery({ queryKey: ["callFlow"], queryFn: callFlowsApi.active });
  const { data: graph, isLoading } = useQuery({
    queryKey: ["flowGraph", flow?.id],
    queryFn: () => callFlowsApi.getGraph(flow!.id),
    enabled: !!flow?.id,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ messageHe: string }[]>([]);
  const [preview, setPreview] = useState("");

  const initial = useMemo(() => (graph ? graphToReactFlow(graph) : { nodes: [], edges: [] }), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [rawNodes, setRawNodes] = useState<FlowNode[]>(graph?.nodes ?? []);

  useEffect(() => {
    if (!graph) return;
    const rf = graphToReactFlow(graph);
    setNodes(rf.nodes);
    setEdges(rf.edges);
    setRawNodes(graph.nodes);
    setSelectedId(graph.startNodeId);
  }, [graph, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds: Edge[]) => addEdge(connection, eds)),
    [setEdges],
  );

  const selectedNode = rawNodes.find((n) => n.id === selectedId);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!flow) throw new Error("no flow");
      const g = reactFlowToGraph(nodes, edges, graph?.startNodeId ?? flow.id, rawNodes);
      return callFlowsApi.saveGraph(flow.id, g);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flowGraph"] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!flow) throw new Error("no flow");
      await saveMutation.mutateAsync();
      return callFlowsApi.publish(flow.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["callFlow"] });
      qc.invalidateQueries({ queryKey: ["flowGraph"] });
    },
  });

  const validateMutation = useMutation({
    mutationFn: () => callFlowsApi.validate(flow!.id),
    onSuccess: (data) => setValidationErrors(data.errors),
  });

  const importMutation = useMutation({
    mutationFn: () => callFlowsApi.importLinear(flow!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flowGraph"] }),
  });

  const addNode = (type: FlowNode["type"]) => {
    const id = `${type}_${Date.now()}`;
    const newNode: FlowNode =
      type === "speak"
        ? { id, type, label: NODE_LABELS[type], text: "טקסט חדש", position: { x: 100, y: 100 } }
        : type === "end"
          ? { id, type, label: NODE_LABELS[type], outcome: "none", position: { x: 100, y: 100 } }
          : { id, type, label: NODE_LABELS[type], position: { x: 100, y: 100 } };
    setRawNodes((prev: FlowNode[]) => [...prev, newNode]);
    setNodes((prev: Node[]) => [
      ...prev,
      {
        id,
        type: "flowNode",
        position: newNode.position ?? { x: 100, y: 100 },
        data: { label: newNode.label, nodeType: type, text: type === "speak" ? newNode.text : undefined },
      },
    ]);
    setSelectedId(id);
  };

  const updateSelectedSpeak = (text: string) => {
    if (!selectedId) return;
    setRawNodes((prev: FlowNode[]) =>
      prev.map((n) => (n.id === selectedId && n.type === "speak" ? { ...n, text } : n)),
    );
    setNodes((prev: Node[]) =>
      prev.map((n: Node) =>
        n.id === selectedId ? { ...n, data: { ...n.data, text } } : n,
      ),
    );
  };

  const previewMutation = useMutation({
    mutationFn: () => {
      const text = selectedNode?.type === "speak" ? (selectedNode.text ?? "") : "{{customer_first_name}}";
      return callFlowsApi.previewOpening(text, "דוד כהן");
    },
    onSuccess: (data) => setPreview(data.preview),
  });

  if (isLoading) return <p>טוען זרימה...</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold">בניית זרימה</h2>
        <div className="flex flex-wrap gap-2">
          {(["speak", "listen", "intent_route", "decision", "end"] as const).map((t) => (
            <button key={t} className="rounded border px-3 py-1 text-sm" onClick={() => addNode(t)}>
              + {NODE_LABELS[t]}
            </button>
          ))}
          <button className="rounded border px-3 py-1 text-sm" onClick={() => importMutation.mutate()}>
            ייבוא מלינארי
          </button>
          <button className="rounded border px-3 py-1 text-sm" onClick={() => validateMutation.mutate()}>
            אימות
          </button>
          <button className="rounded bg-slate-700 px-3 py-1 text-sm text-white" onClick={() => saveMutation.mutate()}>
            שמור טיוטה
          </button>
          <button className="rounded bg-blue-600 px-3 py-1 text-sm text-white" onClick={() => publishMutation.mutate()}>
            פרסם זרימה
          </button>
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          {validationErrors.map((e, i) => (
            <p key={i}>{e.messageHe}</p>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="h-[600px] rounded-xl border bg-white" dir="ltr">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_event: MouseEvent, node: Node) => setSelectedId(node.id)}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h3 className="mb-2 font-semibold">מאפייני צומת</h3>
          {!selectedNode && <p className="text-sm text-slate-500">בחר צומת בקנבס</p>}
          {selectedNode?.type === "speak" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">טקסט דיבור</label>
              <textarea
                className="w-full rounded border p-2 text-sm"
                rows={6}
                value={selectedNode.text}
                onChange={(e) => updateSelectedSpeak(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                משתנים: {"{{customer_full_name}}"}, {"{{customer_first_name}}"}
              </p>
              <button className="rounded border px-3 py-1 text-sm" onClick={() => previewMutation.mutate()}>
                תצוגה מקדימה
              </button>
              {preview && <p className="rounded bg-slate-50 p-2 text-sm">{preview}</p>}
            </div>
          )}
          {selectedNode && selectedNode.type !== "speak" && (
            <p className="text-sm">
              סוג: {NODE_LABELS[selectedNode.type]} ({selectedNode.id})
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
