import { Router } from "express";
import {
  updateCallStatus,
  onCallConnected,
  peekPreloadedOpening,
  ensureOpeningClipForAnswer,
  markOpeningPlaybackStarted,
} from "../services/callService.js";
import { getPlayClip } from "../voice/playAudio.js";
import {
  buildAnswerHoldTwiml,
  buildAnswerWithPlayTwiml,
  buildPauseOnlyTwiml,
  playPreloadedOnTwilioCall,
} from "../voice/twilioPlay.js";
import { logger } from "../logger.js";
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

router.post("/twilio/voice", async (req, res) => {
  const callId = req.query.callId as string;
  if (!callId) {
    res.type("text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    return;
  }

  if (callId === "healthcheck") {
    res.type("text/xml");
    res.send(buildPauseOnlyTwiml());
    return;
  }

  logger.info({ callId, callSid: req.body.CallSid }, "Twilio voice webhook hit");

  const opening = peekPreloadedOpening(callId);
  if (opening) {
    markOpeningPlaybackStarted(callId, opening.durationMs);
    logger.info(
      { callId, clipId: opening.clipId, durationMs: opening.durationMs },
      "Twilio answer webhook — returning opening Play TwiML",
    );
    res.type("text/xml");
    res.send(await buildAnswerWithPlayTwiml(callId, opening.clipId));
    return;
  }

  logger.warn({ callId }, "Opening clip not ready at answer — holding call while rendering");
  res.type("text/xml");
  res.send(await buildAnswerHoldTwiml(callId));

  void (async () => {
    try {
      const ensured = await ensureOpeningClipForAnswer(callId);
      if (!ensured) {
        logger.error({ callId }, "No opening audio after answer — caller will hear silence");
        return;
      }
      markOpeningPlaybackStarted(callId, ensured.durationMs);
      await playPreloadedOnTwilioCall(callId, ensured.clipId, false, ensured.durationMs);
      logger.info({ callId, clipId: ensured.clipId }, "Deferred opening audio queued on Twilio call");
    } catch (err) {
      logger.error({ err, callId }, "Deferred opening audio failed");
    }
  })();
});

router.post("/twilio/status", async (req, res, next) => {
  try {
    const callId = req.query.callId as string;
    const status = req.body.CallStatus as string;
    const map: Record<string, CallStatus> = {
      initiated: "dialing",
      ringing: "ringing",
      answered: "connected",
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
      logger.info(
        { callId, twilioStatus: status, to: req.body.To, from: req.body.From },
        "Twilio status callback",
      );
      if (status === "busy") {
        logger.warn(
          { callId, to: req.body.To },
          "Callee line busy — call never reached voice webhook (check phone is free and not blocking +1 caller ID)",
        );
      }
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
