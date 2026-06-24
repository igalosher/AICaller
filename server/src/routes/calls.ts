import { Router } from "express";
import {
  getActiveCall,
  getCall,
  hangUpCall,
  listCalls,
  startCall,
  startNextCall,
  startTestCall,
  updateCallStatus,
} from "../services/callService.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    res.json(
      await listCalls({
        page: req.query.page ? Number(req.query.page) : undefined,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.get("/active", async (_req, res, next) => {
  try {
    res.json(await getActiveCall());
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json(await getCall(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.post("/start", async (req, res, next) => {
  try {
    const { contactId } = req.body as { contactId: string };
    res.status(201).json(await startCall(contactId));
  } catch (e) {
    next(e);
  }
});

router.post("/test-start", async (req, res, next) => {
  try {
    const { contactId } = req.body as { contactId: string };
    res.status(201).json(await startTestCall(contactId));
  } catch (e) {
    next(e);
  }
});

router.post("/:id/hangup", async (req, res, next) => {
  try {
    await hangUpCall(String(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/next", async (_req, res, next) => {
  try {
    res.status(201).json(await startNextCall());
  } catch (e) {
    next(e);
  }
});

export default router;
