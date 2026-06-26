import { Router } from "express";
import { z } from "zod";
import {
  createAgentExample,
  deleteAgentExample,
  getAgentConfig,
  listAgentExamples,
  saveAgentConfig,
} from "../services/agentConfigService.js";

const router = Router();

const configSchema = z.object({
  missionHe: z.string(),
  limitsHe: z.string(),
  policiesHe: z.string(),
  openingTemplateHe: z.string(),
  maxRejections: z.number().int().min(1).max(5).optional(),
});

router.get("/config", async (_req, res, next) => {
  try {
    res.json(await getAgentConfig());
  } catch (e) {
    next(e);
  }
});

router.put("/config", async (req, res, next) => {
  try {
    const body = configSchema.parse(req.body);
    const current = await getAgentConfig();
    res.json(
      await saveAgentConfig({
        ...current,
        ...body,
        maxRejections: body.maxRejections ?? current.maxRejections,
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.get("/examples", async (_req, res, next) => {
  try {
    res.json({ items: await listAgentExamples() });
  } catch (e) {
    next(e);
  }
});

const exampleSchema = z.object({
  customerText: z.string().min(1),
  aiResponseBad: z.string().optional(),
  correctedText: z.string().min(1),
  callId: z.string().optional(),
  segmentId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

router.post("/examples", async (req, res, next) => {
  try {
    const body = exampleSchema.parse(req.body);
    res.status(201).json(await createAgentExample(body));
  } catch (e) {
    next(e);
  }
});

router.delete("/examples/:id", async (req, res, next) => {
  try {
    await deleteAgentExample(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
