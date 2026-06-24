import { Router } from "express";
import { z } from "zod";
import {
  createCallFlowVersion,
  getActiveCallFlow,
  listCallFlows,
  previewOpeningLine,
} from "../services/callFlowService.js";
import {
  getDraftGraph,
  importLinearToGraph,
  publishFlowGraph,
  saveDraftGraph,
} from "../services/flowGraphService.js";
import { validateFlowGraph } from "../flow/graphValidation.js";
import { validate } from "../middleware/errorHandler.js";
import type { FlowGraph } from "../flow/graphTypes.js";

const router = Router();

const flowSchema = z.object({
  openingTemplate: z.string().min(1),
  stages: z.array(
    z.object({
      id: z.string(),
      prompt: z.string(),
      next: z.string(),
    }),
  ),
  objections: z.record(z.string(), z.string()),
});

const graphSchema = z.object({
  nodes: z.array(z.record(z.string(), z.unknown())),
  edges: z.array(z.record(z.string(), z.unknown())),
  startNodeId: z.string(),
  variables: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(["string", "int", "bool", "json"]),
        defaultValue: z.unknown().optional(),
      }),
    )
    .optional(),
  lookupTables: z
    .array(
      z.object({
        name: z.string(),
        rows: z.array(z.record(z.string(), z.unknown())),
      }),
    )
    .optional(),
  variableBindings: z
    .array(
      z.object({
        listenNodeId: z.string(),
        variableName: z.string(),
        source: z.enum(["entity", "intent", "raw_text"]),
        path: z.string().optional(),
      }),
    )
    .optional(),
  interruptQa: z.boolean().optional(),
});

router.get("/", async (_req, res, next) => {
  try {
    res.json(await listCallFlows());
  } catch (e) {
    next(e);
  }
});

router.get("/active", async (_req, res, next) => {
  try {
    res.json(await getActiveCallFlow());
  } catch (e) {
    next(e);
  }
});

router.post("/", validate(flowSchema), async (req, res, next) => {
  try {
    res.status(201).json(await createCallFlowVersion(req.body));
  } catch (e) {
    next(e);
  }
});

router.post("/preview-opening", async (req, res, next) => {
  try {
    const { openingTemplate, customerName } = req.body as {
      openingTemplate: string;
      customerName?: string;
    };
    res.json({ preview: previewOpeningLine(openingTemplate, customerName) });
  } catch (e) {
    next(e);
  }
});

router.get("/:id/graph", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    res.json(await getDraftGraph(id));
  } catch (e) {
    next(e);
  }
});

router.put("/:id/graph", validate(graphSchema), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const graph = req.body as FlowGraph;
    await saveDraftGraph(id, graph);
    res.json(graph);
  } catch (e) {
    next(e);
  }
});

router.post("/:id/publish", async (req, res, next) => {
  try {
    res.json(await publishFlowGraph(String(req.params.id)));
  } catch (e) {
    next(e);
  }
});

router.post("/:id/validate", async (req, res, next) => {
  try {
    const graph = await getDraftGraph(String(req.params.id));
    res.json({ errors: validateFlowGraph(graph) });
  } catch (e) {
    next(e);
  }
});

router.post("/:id/import-linear", async (req, res, next) => {
  try {
    const graph = await importLinearToGraph(String(req.params.id));
    res.json(graph);
  } catch (e) {
    next(e);
  }
});

export default router;
