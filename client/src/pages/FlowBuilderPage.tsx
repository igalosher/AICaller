import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { memo, useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { callFlowsApi, intentsApi } from "../api";
import type {
  FlowEdge,
  FlowEdgeCondition,
  FlowGraph,
  FlowLookupTableDef,
  FlowNode,
  FlowVariableBinding,
  FlowVariableDef,
} from "../types";
import { CONDITION_OP_LABELS, VARIABLE_TYPE_LABELS } from "../types";
import { layoutFlowNodes } from "../flowLayout";

const NODE_LABELS: Record<string, string> = {
  speak: "דיבור",
  listen: "האזנה",
  decision: "החלטה",
  intent_route: "ניתוב כוונה",
  end: "סיום",
};

function truncateEdgeLabel(label: string, max = 28): string {
  const trimmed = label.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function FlowNodeCard({ data }: { data: { label: string; nodeType: string; text?: string } }) {
  return (
    <div className="box-border w-[220px] min-w-[220px] max-w-[220px] rounded-lg border-2 border-blue-300 bg-white px-3 py-2 text-sm shadow">
      <Handle type="target" position={Position.Top} />
      <div className="break-words font-semibold text-blue-700">{NODE_LABELS[data.nodeType] ?? data.nodeType}</div>
      <div className="break-words text-xs text-slate-600">{data.label}</div>
      {data.text && (
        <div className="mt-1 break-words text-xs leading-snug text-slate-700">{data.text}</div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const MemoFlowNodeCard = memo(FlowNodeCard);

let requestFitView: (() => void) | null = null;

function FitViewController() {
  const { fitView } = useReactFlow();
  useEffect(() => {
    requestFitView = () => {
      void fitView({ padding: 0.15, duration: 150 });
    };
    requestAnimationFrame(() => requestFitView?.());
    return () => {
      requestFitView = null;
    };
  }, [fitView]);
  return null;
}

const nodeTypes = { flowNode: MemoFlowNodeCard };

function getErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err) && err.response?.data?.error) {
    return String(err.response.data.error);
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function formatSavedAt(date: Date): string {
  return date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

type FlowEdgeData = {
  intentId?: string;
  isDefault?: boolean;
  edgeLabel?: string;
  condition?: FlowEdgeCondition;
};

function graphToReactFlow(graph: FlowGraph): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((n) => ({
    id: n.id,
    type: "flowNode",
    position: n.position ?? { x: 0, y: 0 },
    style: { width: 220 },
    data: { label: n.label ?? n.id, nodeType: n.type, text: n.type === "speak" ? n.text : undefined },
  }));
  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: truncateEdgeLabel(e.label ?? e.intentId ?? (e.isDefault ? "ברירת מחדל" : "")),
    data: {
      intentId: e.intentId,
      isDefault: e.isDefault,
      edgeLabel: e.label,
      condition: e.condition,
    } satisfies FlowEdgeData,
  }));
  return { nodes, edges };
}

/** Ensure every intent_route / decision node has exactly one default outgoing edge. */
function patchMissingDefaultEdges(graph: FlowGraph): FlowGraph {
  const routeIds = new Set(
    graph.nodes
      .filter((n) => n.type === "intent_route" || n.type === "decision")
      .map((n) => n.id),
  );
  const bySource = new Map<string, FlowEdge[]>();
  for (const e of graph.edges) {
    if (!routeIds.has(e.source)) continue;
    const list = bySource.get(e.source) ?? [];
    list.push(e);
    bySource.set(e.source, list);
  }

  let edges = graph.edges;
  for (const [source, group] of bySource) {
    if (group.length === 0 || group.some((e) => e.isDefault)) continue;
    const preferred =
      group.find((e) => e.label?.includes("חזרה") || e.label?.includes("ברירת")) ??
      group.find(
        (e) =>
          !e.target.includes("goodbye") &&
          !e.target.startsWith("end_") &&
          e.target.startsWith("speak_"),
      ) ??
      group.find((e) => !e.target.includes("goodbye") && !e.target.startsWith("end_")) ??
      group[group.length - 1]!;
    edges = edges.map((e) => {
      if (e.source !== source) return e;
      if (e.id === preferred.id) {
        return {
          ...e,
          isDefault: true,
          intentId: undefined,
          label: e.label ?? "ברירת מחדל",
        };
      }
      return { ...e, isDefault: undefined };
    });
  }
  return edges === graph.edges ? graph : { ...graph, edges };
}

function reactFlowToGraph(
  nodes: Node[],
  edges: Edge[],
  startNodeId: string,
  rawNodes: FlowNode[],
  variables: FlowVariableDef[],
  lookupTables: FlowLookupTableDef[],
  variableBindings: FlowVariableBinding[],
  interruptQa: boolean,
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
  const flowEdges: FlowEdge[] = edges.map((e) => {
    const meta = (e.data ?? {}) as FlowEdgeData;
    const label =
      meta.edgeLabel ??
      (typeof e.label === "string" && e.label !== "ברירת מחדל" ? e.label : undefined);
    const intentId =
      meta.intentId ??
      (typeof e.label === "string" && e.label.startsWith("intent:")
        ? e.label.slice(7)
        : typeof e.label === "string" && e.label && e.label !== "ברירת מחדל"
          ? e.label
          : undefined);
    const isDefault = meta.isDefault ?? e.label === "ברירת מחדל";
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label,
      intentId: isDefault ? undefined : intentId,
      isDefault: isDefault || undefined,
      condition: meta.condition,
    };
  });
  return {
    startNodeId,
    nodes: flowNodes,
    edges: flowEdges,
    variables,
    lookupTables,
    variableBindings,
    interruptQa,
  };
}

export function FlowBuilderPage() {
  const qc = useQueryClient();
  const { data: flow } = useQuery({ queryKey: ["callFlow"], queryFn: callFlowsApi.active });
  const { data: intents } = useQuery({ queryKey: ["intents"], queryFn: intentsApi.list });
  const { data: graph, isLoading } = useQuery({
    queryKey: ["flowGraph", flow?.id],
    queryFn: () => callFlowsApi.getGraph(flow!.id),
    enabled: !!flow?.id,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ messageHe: string }[]>([]);
  const [preview, setPreview] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const initial = useMemo(() => (graph ? graphToReactFlow(graph) : { nodes: [], edges: [] }), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [rawNodes, setRawNodes] = useState<FlowNode[]>(graph?.nodes ?? []);
  const [flowVariables, setFlowVariables] = useState<FlowVariableDef[]>(graph?.variables ?? []);
  const [lookupTables, setLookupTables] = useState<FlowLookupTableDef[]>(graph?.lookupTables ?? []);
  const [variableBindings, setVariableBindings] = useState<FlowVariableBinding[]>(
    graph?.variableBindings ?? [],
  );
  const [interruptQa, setInterruptQa] = useState(graph?.interruptQa !== false);
  const [sidebarTab, setSidebarTab] = useState<"node" | "variables">("node");
  const [aligning, setAligning] = useState(false);

  const listenNodes = useMemo(
    () => rawNodes.filter((n) => n.type === "listen"),
    [rawNodes],
  );

  useEffect(() => {
    if (!graph) return;
    const patched = patchMissingDefaultEdges(graph);
    const rf = graphToReactFlow(patched);
    setNodes(rf.nodes);
    setEdges(rf.edges);
    setRawNodes(patched.nodes);
    setFlowVariables(patched.variables ?? []);
    setLookupTables(patched.lookupTables ?? []);
    setVariableBindings(patched.variableBindings ?? []);
    setInterruptQa(patched.interruptQa !== false);
    setSelectedId(patched.startNodeId);
  }, [graph, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds: Edge[]) => addEdge(connection, eds)),
    [setEdges],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes.filter((change) => change.type !== "dimensions"));
    },
    [onNodesChange],
  );

  const selectedNode = rawNodes.find((n) => n.id === selectedId);

  const saveGraphDraft = useCallback(async () => {
    if (!flow) throw new Error("אין זרימה פעילה לשמירה");
    const startNodeId = graph?.startNodeId ?? nodes[0]?.id;
    if (!startNodeId) throw new Error("הגרף ריק — אין צומת התחלה");
    const g = patchMissingDefaultEdges(
      reactFlowToGraph(
        nodes,
        edges,
        startNodeId,
        rawNodes,
        flowVariables,
        lookupTables,
        variableBindings,
        interruptQa,
      ),
    );
    return callFlowsApi.saveGraph(flow.id, g);
  }, [flow, nodes, edges, graph?.startNodeId, rawNodes, flowVariables, lookupTables, variableBindings, interruptQa]);

  const applySavedGraph = useCallback(
    (g: FlowGraph, message: string) => {
      qc.setQueryData(["flowGraph", flow?.id], g);
      const rf = graphToReactFlow(g);
      setNodes(rf.nodes);
      setEdges(rf.edges);
      setRawNodes(g.nodes);
      setFlowVariables(g.variables ?? []);
      setLookupTables(g.lookupTables ?? []);
      setVariableBindings(g.variableBindings ?? []);
      setInterruptQa(g.interruptQa !== false);
      setValidationErrors([]);
      setActionError(null);
      setStatusBanner(message);
      setSuccessMessage(message);
    },
    [flow?.id, qc, setEdges, setNodes],
  );

  const saveMutation = useMutation({
    mutationFn: saveGraphDraft,
    onMutate: () => setActionError(null),
    onSuccess: (g) => {
      const message = `הטיוטה נשמרה בהצלחה (${g.nodes.length} צמתים, ${g.edges.length} קשתות) — ${formatSavedAt(new Date())}`;
      applySavedGraph(g, message);
    },
    onError: (err) => setActionError(getErrorMessage(err, "שגיאה בשמירת הטיוטה")),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!flow) throw new Error("אין זרימה פעילה לפרסום");
      const g = await saveGraphDraft();
      const published = await callFlowsApi.publish(flow.id);
      return { graph: g, flow: published };
    },
    onMutate: () => setActionError(null),
    onSuccess: ({ graph: g, flow: published }) => {
      qc.setQueryData(["callFlow"], published);
      const message = `הזרימה פורסמה בהצלחה (גרסה ${published.version}) — ${formatSavedAt(new Date())}`;
      qc.setQueryData(["flowGraph", published.id], g);
      applySavedGraph(g, message);
    },
    onError: (err) => {
      const message = getErrorMessage(err, "שגיאה בפרסום הזרימה");
      setActionError(message);
      if (message.includes(";")) {
        setValidationErrors(message.split(";").map((messageHe) => ({ messageHe: messageHe.trim() })));
      }
    },
  });

  const reloadMutation = useMutation({
    mutationFn: () => callFlowsApi.getGraph(flow!.id),
    onSuccess: (g) => {
      qc.setQueryData(["flowGraph", flow?.id], g);
      const rf = graphToReactFlow(g);
      setNodes(rf.nodes);
      setEdges(rf.edges);
      setRawNodes(g.nodes);
      setFlowVariables(g.variables ?? []);
      setLookupTables(g.lookupTables ?? []);
      setVariableBindings(g.variableBindings ?? []);
      setInterruptQa(g.interruptQa !== false);
      setSelectedId(g.startNodeId);
      setValidationErrors([]);
      setPreview("");
      setSuccessMessage("הזרימה נטענה מחדש מהשרת");
    },
  });

  const handleReload = () => {
    if (!flow?.id) return;
    if (!window.confirm("לבטל שינויים שלא נשמרו ולטעון את הגרסה האחרונה מהשרת?")) return;
    reloadMutation.mutate();
  };

  const validateMutation = useMutation({
    mutationFn: async () => {
      await saveGraphDraft();
      return callFlowsApi.validate(flow!.id);
    },
    onSuccess: (data) => {
      setValidationErrors(data.errors);
      if (data.errors.length === 0) {
        setStatusBanner("הזרימה תקינה — מוכנה לפרסום");
        setActionError(null);
      } else {
        setActionError(`נמצאו ${data.errors.length} שגיאות אימות — ראה רשימה למטה`);
      }
    },
    onError: (err) => setActionError(getErrorMessage(err, "שגיאה באימות הזרימה")),
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

  const insertVariableIntoSpeak = (varName: string) => {
    if (!selectedNode || selectedNode.type !== "speak") return;
    const token = `{{${varName}}}`;
    updateSelectedSpeak(`${selectedNode.text ?? ""}${token}`);
  };

  const updateEdgeCondition = (edgeId: string, condition: FlowEdgeCondition | undefined) => {
    setEdges((prev: Edge[]) =>
      prev.map((e: Edge) =>
        e.id === edgeId
          ? { ...e, data: { ...(e.data as FlowEdgeData), condition } }
          : e,
      ),
    );
  };

  const updateRouteEdge = (
    edgeId: string,
    patch: Partial<FlowEdgeData> & { markDefault?: boolean },
  ) => {
    const target = edges.find((e) => e.id === edgeId);
    if (!target) return;

    setEdges((prev: Edge[]) =>
      prev.map((e: Edge) => {
        const meta = (e.data ?? {}) as FlowEdgeData;

        if (patch.markDefault) {
          if (e.source !== target.source) return e;
          if (e.id === edgeId) {
            return {
              ...e,
              label: "ברירת מחדל",
              data: { ...meta, isDefault: true, intentId: undefined, condition: undefined },
            };
          }
          return {
            ...e,
            label:
              meta.intentId ??
              meta.edgeLabel ??
              (typeof e.label === "string" && e.label !== "ברירת מחדל" ? e.label : ""),
            data: { ...meta, isDefault: false },
          };
        }

        if (e.id !== edgeId) return e;

        const next: FlowEdgeData = { ...meta, ...patch };
        if (next.isDefault) next.intentId = undefined;

        const label = next.isDefault
          ? "ברירת מחדל"
          : next.intentId ?? next.edgeLabel ?? (typeof e.label === "string" ? e.label : "");

        return { ...e, label, data: next };
      }),
    );
  };

  const decisionEdges = useMemo(() => {
    if (!selectedId || selectedNode?.type !== "decision") return [];
    return edges.filter((e) => e.source === selectedId);
  }, [edges, selectedId, selectedNode?.type]);

  const routeEdges = useMemo(() => {
    if (!selectedId || selectedNode?.type !== "intent_route") return [];
    return edges.filter((e) => e.source === selectedId);
  }, [edges, selectedId, selectedNode?.type]);

  const lookupColumns = (tableName: string): string[] => {
    const table = lookupTables.find((t) => t.name === tableName);
    if (!table?.rows?.length) return [];
    return Object.keys(table.rows[0]!);
  };

  const addFlowVariable = () => {
    const name = `Var${flowVariables.length + 1}`;
    setFlowVariables((prev) => [...prev, { name, type: "string", defaultValue: "" }]);
  };

  const addLookupTable = () => {
    const name = `Table${lookupTables.length + 1}`;
    setLookupTables((prev) => [...prev, { name, rows: [] }]);
  };

  const addVariableBinding = () => {
    const listenNodeId = listenNodes[0]?.id ?? "";
    const variableName = flowVariables[0]?.name ?? "";
    if (!listenNodeId || !variableName) return;
    setVariableBindings((prev) => [
      ...prev,
      { listenNodeId, variableName, source: "entity" },
    ]);
  };

  const handleAlignLayout = () => {
    const startNodeId = graph?.startNodeId ?? nodes[0]?.id;
    if (!startNodeId || nodes.length === 0 || aligning) return;
    setAligning(true);
    try {
      const layouted = layoutFlowNodes(nodes, edges, startNodeId);
      const posById = new Map(layouted.map((n) => [n.id, n.position]));
      setNodes(layouted);
      setRawNodes((prev) =>
        prev.map((n) => {
          const position = posById.get(n.id);
          return position ? { ...n, position } : n;
        }),
      );
      setStatusBanner("הפריסה סודרה — שמור טיוטה כדי לשמור מיקומים");
      requestAnimationFrame(() => requestFitView?.());
    } finally {
      setAligning(false);
    }
  };

  const previewMutation = useMutation({
    mutationFn: () => {
      const text = selectedNode?.type === "speak" ? (selectedNode.text ?? "") : "{{customer_first_name}}";
      let previewText = text;
      for (const v of flowVariables) {
        const sample =
          v.defaultValue !== undefined
            ? String(v.defaultValue)
            : v.type === "int"
              ? "3"
              : v.type === "bool"
                ? "כן"
                : "דוגמה";
        previewText = previewText.replaceAll(`{{${v.name}}}`, sample);
      }
      return callFlowsApi.previewOpening(previewText, "דוד כהן");
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
          <button
            type="button"
            className="rounded border border-violet-300 bg-violet-50 px-3 py-1 text-sm text-violet-900 disabled:opacity-50"
            onClick={handleAlignLayout}
            disabled={nodes.length === 0 || aligning}
          >
            {aligning ? "מסדר..." : "סדר פריסה"}
          </button>
          <button
            type="button"
            className="rounded border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-900 disabled:opacity-50"
            onClick={handleReload}
            disabled={reloadMutation.isPending || !flow?.id}
          >
            {reloadMutation.isPending ? "טוען..." : "טען מחדש"}
          </button>
          <button
            type="button"
            className="rounded bg-slate-700 px-3 py-1 text-sm text-white disabled:opacity-50"
            onClick={() => saveMutation.mutate()}
            disabled={!flow?.id || saveMutation.isPending || publishMutation.isPending || reloadMutation.isPending}
          >
            {saveMutation.isPending ? "שומר..." : "שמור טיוטה"}
          </button>
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
            onClick={() => publishMutation.mutate()}
            disabled={!flow?.id || saveMutation.isPending || publishMutation.isPending || reloadMutation.isPending}
          >
            {publishMutation.isPending ? "מפרסם..." : "פרסם זרימה"}
          </button>
        </div>
      </div>

      {statusBanner && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          {statusBanner}
        </div>
      )}

      {successMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-lg">
            <p className="mb-4 text-lg font-medium text-green-800">{successMessage}</p>
            <button
              type="button"
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white"
              onClick={() => {
                setSuccessMessage(null);
                setStatusBanner((prev) => prev ?? successMessage);
              }}
            >
              אישור
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-lg">
            <p className="mb-4 text-lg font-medium text-red-800">{actionError}</p>
            <button
              type="button"
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white"
              onClick={() => setActionError(null)}
            >
              אישור
            </button>
          </div>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          {validationErrors.map((e, i) => (
            <p key={i}>{e.messageHe}</p>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="h-[600px] rounded-xl border bg-white" dir="ltr">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              onNodeClick={(_event: MouseEvent, node: Node) => setSelectedId(node.id)}
              nodesDraggable
              elementsSelectable
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
              <MiniMap />
              <FitViewController />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="mb-3 flex gap-2 border-b pb-2">
            <button
              type="button"
              className={`rounded px-2 py-1 text-sm ${sidebarTab === "node" ? "bg-blue-100 font-semibold" : ""}`}
              onClick={() => setSidebarTab("node")}
            >
              צומת
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 text-sm ${sidebarTab === "variables" ? "bg-blue-100 font-semibold" : ""}`}
              onClick={() => setSidebarTab("variables")}
            >
              משתנים
            </button>
          </div>

          {sidebarTab === "variables" && (
            <div className="space-y-4 text-sm">
              <div className="rounded border border-blue-100 bg-blue-50 p-2 text-xs text-blue-900">
                שינויים במשתנים נשמרים בלחיצה על &quot;שמור טיוטה&quot; או &quot;פרסם זרימה&quot;.
              </div>

              <label className="flex items-center gap-2 rounded border p-2">
                <input
                  type="checkbox"
                  checked={interruptQa}
                  onChange={(e) => setInterruptQa(e.target.checked)}
                />
                <span>
                  <span className="font-medium">הפרעת שאלות לקוח (Q&amp;A)</span>
                  <span className="block text-xs text-slate-600">
                    בכל שלב שאלה — לקוח יכול לשאול על ערוצים/חבילות ולקבל תשובה, ואז נשאל שוב את
                    השאלה הנוכחית
                  </span>
                </span>
              </label>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold">משתני זרימה</h3>
                  <button type="button" className="rounded border px-2 py-0.5 text-xs" onClick={addFlowVariable}>
                    + משתנה
                  </button>
                </div>
                {flowVariables.length === 0 && (
                  <p className="text-xs text-slate-500">אין משתנים — הוסף משתנה לדוגמה NumOfTVs</p>
                )}
                {flowVariables.map((v, idx) => (
                  <div key={idx} className="mb-2 space-y-1 rounded border p-2">
                    <input
                      className="w-full rounded border px-2 py-1"
                      value={v.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setFlowVariables((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, name } : item)),
                        );
                      }}
                      placeholder="שם משתנה"
                    />
                    <select
                      className="w-full rounded border px-2 py-1"
                      value={v.type}
                      onChange={(e) => {
                        const type = e.target.value as FlowVariableDef["type"];
                        setFlowVariables((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, type } : item)),
                        );
                      }}
                    >
                      {Object.entries(VARIABLE_TYPE_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="w-full rounded border px-2 py-1"
                      value={v.defaultValue !== undefined ? String(v.defaultValue) : ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        let defaultValue: FlowVariableDef["defaultValue"] = raw;
                        if (v.type === "int") defaultValue = Number(raw) || 0;
                        if (v.type === "bool") defaultValue = raw === "true" || raw === "כן";
                        setFlowVariables((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, defaultValue } : item)),
                        );
                      }}
                      placeholder="ברירת מחדל (אופציונלי)"
                    />
                    <button
                      type="button"
                      className="text-xs text-red-600"
                      onClick={() => setFlowVariables((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      מחק
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold">קישור משתנים לשאלות</h3>
                  <button
                    type="button"
                    className="rounded border px-2 py-0.5 text-xs"
                    onClick={addVariableBinding}
                    disabled={listenNodes.length === 0 || flowVariables.length === 0}
                  >
                    + קישור
                  </button>
                </div>
                <p className="mb-2 text-xs text-slate-500">
                  בחר שאלת האזנה, משתנה, ומקור הערך. &quot;ישות מסווגת&quot; ממלא את המשתנה מתשובה מפורשת
                  (למשל numOfTVs ממספר טלוויזיות).
                </p>
                {variableBindings.map((b, idx) => (
                  <div key={idx} className="mb-2 space-y-1 rounded border p-2">
                    <select
                      className="w-full rounded border px-2 py-1"
                      value={b.listenNodeId}
                      onChange={(e) => {
                        const listenNodeId = e.target.value;
                        setVariableBindings((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, listenNodeId } : item)),
                        );
                      }}
                    >
                      {listenNodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.label ?? n.id}
                        </option>
                      ))}
                    </select>
                    <select
                      className="w-full rounded border px-2 py-1"
                      value={b.variableName}
                      onChange={(e) => {
                        const variableName = e.target.value;
                        setVariableBindings((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, variableName } : item)),
                        );
                      }}
                    >
                      {flowVariables.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="w-full rounded border px-2 py-1"
                      value={b.source}
                      onChange={(e) => {
                        const source = e.target.value as FlowVariableBinding["source"];
                        setVariableBindings((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, source } : item)),
                        );
                      }}
                    >
                      <option value="entity">ישות מסווגת</option>
                      <option value="raw_text">טקסט גולמי</option>
                      <option value="intent">כוונה</option>
                    </select>
                    <button
                      type="button"
                      className="text-xs text-red-600"
                      onClick={() => setVariableBindings((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      מחק
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold">טבלאות חיפוש (JSON)</h3>
                  <button type="button" className="rounded border px-2 py-0.5 text-xs" onClick={addLookupTable}>
                    + טבלה
                  </button>
                </div>
                {lookupTables.map((table, idx) => (
                  <div key={idx} className="mb-2 space-y-1 rounded border p-2">
                    <input
                      className="w-full rounded border px-2 py-1"
                      value={table.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setLookupTables((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, name } : item)),
                        );
                      }}
                      placeholder="שם טבלה"
                    />
                    <textarea
                      className="w-full rounded border p-2 font-mono text-xs"
                      rows={5}
                      value={JSON.stringify(table.rows, null, 2)}
                      onChange={(e) => {
                        try {
                          const rows = JSON.parse(e.target.value) as Record<string, unknown>[];
                          setLookupTables((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, rows } : item)),
                          );
                        } catch {
                          // keep typing
                        }
                      }}
                    />
                    <p className="text-xs text-slate-500">
                      {table.rows.length} שורות
                      {table.rows[0] ? ` · עמודות: ${Object.keys(table.rows[0]).join(", ")}` : ""}
                    </p>
                    <button
                      type="button"
                      className="text-xs text-red-600"
                      onClick={() => setLookupTables((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      מחק
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sidebarTab === "node" && (
            <>
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
                {flowVariables.length > 0 && ", משתני זרימה למטה"}
              </p>
              <p className="text-xs text-slate-500">
                מגדר (כשהכתיב שונה): {"{{g:תרצה|תרצי}}"} — ענף ראשון לזכר, שני לנקבה. מילים כמו לך / אליך
                מבוטאות לפי מין איש הקשר ב-TTS; אין צורך בסימון.
              </p>
              {flowVariables.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {flowVariables.map((v) => (
                    <button
                      key={v.name}
                      type="button"
                      className="rounded border px-2 py-0.5 text-xs"
                      onClick={() => insertVariableIntoSpeak(v.name)}
                    >
                      {`{{${v.name}}}`}
                    </button>
                  ))}
                </div>
              )}
              <button className="rounded border px-3 py-1 text-sm" onClick={() => previewMutation.mutate()}>
                תצוגה מקדימה
              </button>
              {preview && <p className="break-words rounded bg-slate-50 p-2 text-sm leading-relaxed">{preview}</p>}
            </div>
          )}
          {selectedNode?.type === "listen" && (
            <p className="text-sm text-slate-600">
              סוג: האזנה ({selectedNode.id})
              <br />
              <span className="text-xs">
                לקישור משתנים מתשובה — עבור ללשונית &quot;משתנים&quot;
              </span>
            </p>
          )}
          {selectedNode?.type === "intent_route" && (
            <div className="space-y-2 text-sm">
              <p>סוג: ניתוב כוונה ({selectedNode.id})</p>
              <h4 className="font-medium">קשתות יוצאות</h4>
              <p className="text-xs text-slate-500">
                כל צומת ניתוב חייב יציאת ברירת מחדל אחת (כשאין כוונה מתאימה).
              </p>
              {routeEdges.length === 0 && (
                <p className="text-xs text-amber-700">אין קשתות — חבר יציאות מהצומת בקנבס.</p>
              )}
              {routeEdges.map((edge) => {
                const meta = (edge.data ?? {}) as FlowEdgeData;
                const targetLabel =
                  rawNodes.find((n) => n.id === edge.target)?.label ?? edge.target;
                return (
                  <div key={edge.id} className="rounded border p-2">
                    <p className="mb-1 break-words text-xs font-medium">→ {targetLabel}</p>
                    <label className="mb-2 flex items-center gap-2 text-xs">
                      <input
                        type="radio"
                        name={`default-${selectedId}`}
                        checked={!!meta.isDefault}
                        onChange={() => updateRouteEdge(edge.id, { markDefault: true })}
                      />
                      ברירת מחדל
                    </label>
                    {!meta.isDefault && (
                      <>
                        <select
                          className="mb-1 w-full rounded border px-2 py-1"
                          value={meta.intentId ?? ""}
                          onChange={(e) =>
                            updateRouteEdge(edge.id, {
                              intentId: e.target.value || undefined,
                            })
                          }
                        >
                          <option value="">בחר כוונה</option>
                          {(intents ?? []).map((intent) => (
                            <option key={intent.id} value={intent.id}>
                              {intent.labelHe} ({intent.id})
                            </option>
                          ))}
                        </select>
                        <input
                          className="w-full rounded border px-2 py-1 text-xs"
                          placeholder="תווית (אופציונלי)"
                          value={meta.edgeLabel ?? ""}
                          onChange={(e) =>
                            updateRouteEdge(edge.id, { edgeLabel: e.target.value || undefined })
                          }
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {selectedNode?.type === "decision" && (
            <div className="space-y-2 text-sm">
              <p>סוג: החלטה ({selectedNode.id})</p>
              <h4 className="font-medium">תנאי לקשתות יוצאות</h4>
              {decisionEdges.map((edge) => {
                const meta = (edge.data ?? {}) as FlowEdgeData;
                const cond = meta.condition;
                const targetLabel =
                  rawNodes.find((n) => n.id === edge.target)?.label ?? edge.target;
                return (
                  <div key={edge.id} className="rounded border p-2">
                    <p className="mb-1 break-words text-xs font-medium">→ {targetLabel}</p>
                    {meta.isDefault ? (
                      <p className="text-xs text-slate-500">ברירת מחדל</p>
                    ) : (
                      <>
                        <select
                          className="mb-1 w-full rounded border px-2 py-1"
                          value={cond?.op ?? "var_eq"}
                          onChange={(e) => {
                            const op = e.target.value as FlowEdgeCondition["op"];
                            updateEdgeCondition(edge.id, {
                              op,
                              variable: flowVariables[0]?.name,
                              literal: 0,
                            });
                          }}
                        >
                          {Object.entries(CONDITION_OP_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {cond?.op !== "lookup_exists" && (
                          <select
                            className="mb-1 w-full rounded border px-2 py-1"
                            value={cond?.variable ?? ""}
                            onChange={(e) =>
                              updateEdgeCondition(edge.id, {
                                ...(cond ?? { op: "var_eq" }),
                                variable: e.target.value,
                              })
                            }
                          >
                            {flowVariables.map((v) => (
                              <option key={v.name} value={v.name}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {cond?.op === "lookup_exists" && (
                          <>
                            <select
                              className="mb-1 w-full rounded border px-2 py-1"
                              value={cond.table ?? ""}
                              onChange={(e) =>
                                updateEdgeCondition(edge.id, {
                                  ...cond,
                                  table: e.target.value,
                                  column: lookupColumns(e.target.value)[0],
                                })
                              }
                            >
                              {lookupTables.map((t) => (
                                <option key={t.name} value={t.name}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                            <select
                              className="mb-1 w-full rounded border px-2 py-1"
                              value={cond.column ?? ""}
                              onChange={(e) =>
                                updateEdgeCondition(edge.id, { ...cond, column: e.target.value })
                              }
                            >
                              {lookupColumns(cond.table ?? "").map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                            <select
                              className="w-full rounded border px-2 py-1"
                              value={cond.variable ?? ""}
                              onChange={(e) =>
                                updateEdgeCondition(edge.id, { ...cond, variable: e.target.value })
                              }
                            >
                              {flowVariables.map((v) => (
                                <option key={v.name} value={v.name}>
                                  ערך מ-{v.name}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        {cond &&
                          cond.op !== "var_empty" &&
                          cond.op !== "var_not_empty" &&
                          cond.op !== "lookup_exists" && (
                            <input
                              className="w-full rounded border px-2 py-1"
                              placeholder="ערך להשוואה"
                              value={cond.literal !== undefined ? String(cond.literal) : ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const literal = Number.isNaN(Number(raw)) ? raw : Number(raw);
                                updateEdgeCondition(edge.id, { ...cond, literal });
                              }}
                            />
                          )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {selectedNode &&
            !["speak", "listen", "decision", "intent_route"].includes(selectedNode.type) && (
            <p className="text-sm">
              סוג: {NODE_LABELS[selectedNode.type]} ({selectedNode.id})
            </p>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
