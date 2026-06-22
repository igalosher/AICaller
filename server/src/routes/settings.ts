import { Router } from "express";
import {
  getAiConfig,
  getTelephonyConfig,
  getTelephonyProvider,
  saveAiConfig,
  saveTelephonyConfig,
} from "../services/settingsService.js";
import { productTools } from "../services/productKnowledge.js";

const router = Router();

router.get("/telephony", async (_req, res, next) => {
  try {
    const config = await getTelephonyConfig();
    res.json({
      provider: config.provider,
      phoneNumber: config.phoneNumber ? "••••" + config.phoneNumber.slice(-4) : null,
      configured: Boolean(config.accountSid || config.provider === "mock"),
    });
  } catch (e) {
    next(e);
  }
});

router.put("/telephony", async (req, res, next) => {
  try {
    await saveTelephonyConfig(req.body);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/telephony/test", async (_req, res, next) => {
  try {
    const provider = await getTelephonyProvider();
    res.json(await provider.testConnection());
  } catch (e) {
    next(e);
  }
});

router.get("/ai", async (_req, res, next) => {
  try {
    const config = await getAiConfig();
    res.json({
      openaiConfigured: Boolean(config.openaiApiKey),
      deepgramConfigured: Boolean(config.deepgramApiKey),
      elevenLabsConfigured: Boolean(config.elevenLabsApiKey),
    });
  } catch (e) {
    next(e);
  }
});

router.put("/ai", async (req, res, next) => {
  try {
    await saveAiConfig(req.body);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/product-tools/list-packets", async (_req, res, next) => {
  try {
    res.json(await productTools.list_packets());
  } catch (e) {
    next(e);
  }
});

export default router;
