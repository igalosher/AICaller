import { Router } from "express";
import {
  updateCallStatus,
  onCallConnected,
  kickoffInitialVoice,
} from "../services/callService.js";
import { getPlayClip } from "../voice/playAudio.js";
import { buildHoldTwiml } from "../voice/twilioPlay.js";
import type { CallOutcome, CallStatus } from "@prisma/client";

const router = Router();

router.get("/twilio/audio/:clipId", (req, res) => {
  const clip = getPlayClip(req.params.clipId);
  if (!clip) {
    res.sendStatus(404);
    return;
  }
  res.setHeader("Content-Type", clip.contentType);
  res.setHeader("Cache-Control", "no-store");
  res.send(clip.buffer);
});

router.post("/twilio/voice", (req, res) => {
  const callId = req.query.callId as string;
  if (!callId) {
    res.type("text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    return;
  }

  // Answer immediately so Twilio does not time out while we synthesize speech.
  res.type("text/xml");
  res.send(buildHoldTwiml(callId));
  void kickoffInitialVoice(callId);
});

router.post("/twilio/status", async (req, res, next) => {
  try {
    const callId = req.query.callId as string;
    const status = req.body.CallStatus as string;
    const map: Record<string, CallStatus> = {
      initiated: "dialing",
      ringing: "ringing",
      "in-progress": "connected",
      completed: "ended",
      busy: "busy",
      "no-answer": "no_answer",
      failed: "failed",
      canceled: "failed",
    };
    const outcomeMap: Record<string, CallOutcome> = {
      busy: "no_answer",
      "no-answer": "no_answer",
      failed: "no_answer",
      canceled: "no_answer",
    };
    if (callId && map[status]) {
      await updateCallStatus(callId, map[status], outcomeMap[status]);
      if (status === "in-progress") {
        void onCallConnected(callId);
      }
    }
    res.sendStatus(204);
  } catch (e) {
    next(e);
  }
});

export default router;
