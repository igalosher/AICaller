import { Router } from "express";
import { z } from "zod";
import { salesService } from "../services/salesService.js";
import { validate } from "../middleware/errorHandler.js";

const router = Router();

import {
  getYesCatalog,
  importYesCatalog,
  loadDefaultYesCatalog,
} from "../services/yesCatalogService.js";

router.get("/catalog", async (_req, res, next) => {
  try {
    res.json((await getYesCatalog()) ?? { catalog: null });
  } catch (e) {
    next(e);
  }
});

router.post("/catalog/import", async (req, res, next) => {
  try {
    const catalog = req.body.catalog ?? req.body;
    const summary = await importYesCatalog(catalog);
    res.json({ ok: true, summary });
  } catch (e) {
    next(e);
  }
});

router.post("/catalog/load-default", async (_req, res, next) => {
  try {
    const summary = await loadDefaultYesCatalog();
    res.json({ ok: true, summary });
  } catch (e) {
    next(e);
  }
});

router.get("/packets", async (_req, res, next) => {
  try {
    res.json(await salesService.listPackets());
  } catch (e) {
    next(e);
  }
});

router.post(
  "/packets",
  validate(
    z.object({
      nameHe: z.string().min(1),
      descriptionHe: z.string(),
      priceMonthly: z.number().positive(),
      contractMonths: z.number().int().optional(),
      channelIds: z.array(z.string()).optional(),
      internetTierId: z.string().optional(),
      phonePlanId: z.string().optional(),
      active: z.boolean().optional(),
    }),
  ),
  async (req, res, next) => {
    try {
      res.status(201).json(await salesService.createPacket(req.body));
    } catch (e) {
      next(e);
    }
  },
);

router.put("/packets/:id", async (req, res, next) => {
  try {
    res.json(await salesService.updatePacket(req.params.id, req.body));
  } catch (e) {
    next(e);
  }
});

router.delete("/packets/:id", async (req, res, next) => {
  try {
    res.json(await salesService.deletePacket(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get("/channels", async (_req, res, next) => {
  try {
    res.json(await salesService.listChannels());
  } catch (e) {
    next(e);
  }
});

router.post(
  "/channels",
  validate(
    z.object({
      nameHe: z.string(),
      channels: z.array(z.string()),
      priceAddon: z.number().optional(),
    }),
  ),
  async (req, res, next) => {
    try {
      res.status(201).json(await salesService.createChannel(req.body));
    } catch (e) {
      next(e);
    }
  },
);

router.put("/channels/:id", async (req, res, next) => {
  try {
    res.json(await salesService.updateChannel(req.params.id, req.body));
  } catch (e) {
    next(e);
  }
});

router.get("/internet-tiers", async (_req, res, next) => {
  try {
    res.json(await salesService.listInternetTiers());
  } catch (e) {
    next(e);
  }
});

router.post("/internet-tiers", async (req, res, next) => {
  try {
    res.status(201).json(await salesService.createInternetTier(req.body));
  } catch (e) {
    next(e);
  }
});

router.put("/internet-tiers/:id", async (req, res, next) => {
  try {
    res.json(await salesService.updateInternetTier(req.params.id, req.body));
  } catch (e) {
    next(e);
  }
});

router.get("/phone-plans", async (_req, res, next) => {
  try {
    res.json(await salesService.listPhonePlans());
  } catch (e) {
    next(e);
  }
});

router.post("/phone-plans", async (req, res, next) => {
  try {
    res.status(201).json(await salesService.createPhonePlan(req.body));
  } catch (e) {
    next(e);
  }
});

router.put("/phone-plans/:id", async (req, res, next) => {
  try {
    res.json(await salesService.updatePhonePlan(req.params.id, req.body));
  } catch (e) {
    next(e);
  }
});

export default router;
