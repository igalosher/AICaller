import twilio from "twilio";
import { logger } from "../logger.js";
import { canonicalE164Digits } from "../utils/phone.js";
import type { TelephonyProvider, DialResult } from "./provider.js";

export class TwilioProvider implements TelephonyProvider {
  name = "twilio";
  private client: twilio.Twilio;

  constructor(
    private accountSid: string,
    private authToken: string,
    private fromNumber: string,
    private webhookBaseUrl: string,
  ) {
    this.client = twilio(accountSid, authToken);
  }

  /** Trial accounts: use verified Israeli caller ID when calling that number (better pickup than +1). */
  private async resolveFromNumber(to: string): Promise<string> {
    try {
      const target = canonicalE164Digits(to);
      const verified = await this.client.outgoingCallerIds.list({ limit: 50 });
      const match = verified.find((v) => canonicalE164Digits(v.phoneNumber) === target);
      if (match?.phoneNumber) {
        logger.info({ to, from: match.phoneNumber }, "Using verified caller ID as From");
        return match.phoneNumber;
      }
    } catch {
      // fall through
    }
    return this.fromNumber;
  }

  /** Trial accounts match verified numbers literally; Twilio may store +9720… instead of +972…. */
  private async resolveTrialDestination(to: string): Promise<string> {
    try {
      const target = canonicalE164Digits(to);
      const verified = await this.client.outgoingCallerIds.list({ limit: 50 });
      const match = verified.find((v) => canonicalE164Digits(v.phoneNumber) === target);
      return match?.phoneNumber ?? to;
    } catch {
      return to;
    }
  }

  async dial(to: string, callId: string): Promise<DialResult> {
    const destination = await this.resolveTrialDestination(to);
    const from = await this.resolveFromNumber(destination);
    const voiceUrl = `${this.webhookBaseUrl}/api/webhooks/twilio/voice?callId=${callId}`;
    logger.info({ callId, to: destination, from, voiceUrl }, "Twilio calls.create");
    const call = await this.client.calls.create({
      to: destination,
      from,
      url: voiceUrl,
      timeout: 55,
      statusCallback: `${this.webhookBaseUrl}/api/webhooks/twilio/status?callId=${callId}`,
      statusCallbackEvent: [
        "initiated",
        "ringing",
        "answered",
        "completed",
        "busy",
        "no-answer",
        "failed",
        "canceled",
      ],
      statusCallbackMethod: "POST",
    });
    return { externalCallId: call.sid, status: call.status };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.client.api.accounts(this.accountSid).fetch();
      return { ok: true, message: "חיבור Twilio תקין" };
    } catch {
      return { ok: false, message: "חיבור Twilio נכשל — בדוק את פרטי ההתחברות" };
    }
  }
}
