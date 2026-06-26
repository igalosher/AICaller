import { Router } from "express";
import { z } from "zod";
import {
  approveAgentDraft,
  createAgentDrafts,
  discardAgentDraft,
  listPendingAgentDrafts,
} from "../services/agentDraftService.js";
import {
  createAgentExample,
  deleteAgentExample,
  getAgentConfig,
  getAgentVersion,
  listAgentExamples,
  listAgentVersions,
  restoreAgentVersion,
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
        missionHe: body.missionHe,
        limitsHe: body.limitsHe,
        policiesHe: body.policiesHe,
        openingTemplateHe: body.openingTemplateHe,
        maxRejections: body.maxRejections ?? current.maxRejections,
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.get("/versions", async (_req, res, next) => {
  try {
    res.json({ items: await listAgentVersions() });
  } catch (e) {
    next(e);
  }
});

router.get("/versions/:id", async (req, res, next) => {
  try {
    const version = await getAgentVersion(req.params.id);
    if (!version) {
      res.status(404).json({ error: "גרסה לא נמצאה" });
      return;
    }
    res.json(version);
  } catch (e) {
    next(e);
  }
});

router.post("/versions/:id/restore", async (req, res, next) => {
  try {
    res.json(await restoreAgentVersion(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get("/drafts", async (_req, res, next) => {
  try {
    res.json({ items: await listPendingAgentDrafts() });
  } catch (e) {
    next(e);
  }
});

const draftSchema = z.object({
  customerText: z.string().optional(),
  aiResponseBad: z.string().optional(),
  correctedText: z.string().optional(),
  configField: z.enum(["missionHe", "limitsHe", "policiesHe"]).optional(),
  patchText: z.string().optional(),
  callId: z.string().optional(),
  segmentId: z.string().optional(),
  operatorNote: z.string().optional(),
});

router.post("/drafts", async (req, res, next) => {
  try {
    const body = draftSchema.parse(req.body);
    const items = await createAgentDrafts(body);
    res.status(201).json({ items });
  } catch (e) {
    next(e);
  }
});

router.post("/drafts/:id/approve", async (req, res, next) => {
  try {
    res.json(await approveAgentDraft(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.post("/drafts/:id/discard", async (req, res, next) => {
  try {
    res.json(await discardAgentDraft(req.params.id));
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
