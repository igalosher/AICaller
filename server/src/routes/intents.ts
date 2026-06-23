import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/errorHandler.js";
import {
  addIntentExample,
  createIntent,
  deleteIntentExample,
  listIntents,
  relabelUtterance,
  updateIntent,
} from "../services/intentService.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(await listIntents());
  } catch (e) {
    next(e);
  }
});

router.post(
  "/",
  validate(
    z.object({
      id: z.string().min(1),
      labelHe: z.string().min(1),
      descriptionHe: z.string().optional(),
      category: z.string().optional(),
      confidenceThreshold: z.number().min(0).max(1).optional(),
    }),
  ),
  async (req, res, next) => {
    try {
      res.status(201).json(await createIntent(req.body));
    } catch (e) {
      next(e);
    }
  },
);

router.put("/:id", async (req, res, next) => {
  try {
    res.json(await updateIntent(String(req.params.id), req.body));
  } catch (e) {
    next(e);
  }
});

router.post(
  "/:id/examples",
  validate(z.object({ phrase: z.string().min(1) })),
  async (req, res, next) => {
    try {
      res.status(201).json(await addIntentExample(String(req.params.id), req.body.phrase));
    } catch (e) {
      next(e);
    }
  },
);

router.delete("/examples/:exampleId", async (req, res, next) => {
  try {
    res.json(await deleteIntentExample(req.params.exampleId));
  } catch (e) {
    next(e);
  }
});

router.post(
  "/relabel",
  validate(
    z.object({
      segmentId: z.string(),
      intentId: z.string(),
      addAsExample: z.boolean().optional(),
    }),
  ),
  async (req, res, next) => {
    try {
      res.json(
        await relabelUtterance(
          req.body.segmentId,
          req.body.intentId,
          req.body.addAsExample ?? false,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

export default router;
