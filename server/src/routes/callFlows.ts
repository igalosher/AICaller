import { Router } from "express";
import { z } from "zod";
import {
  createCallFlowVersion,
  getActiveCallFlow,
  listCallFlows,
  previewOpeningLine,
} from "../services/callFlowService.js";
import { validate } from "../middleware/errorHandler.js";

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

export default router;
