import twilio from "twilio";
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
    const call = await this.client.calls.create({
      to: destination,
      from: this.fromNumber,
      url: `${this.webhookBaseUrl}/api/webhooks/twilio/voice?callId=${callId}`,
      statusCallback: `${this.webhookBaseUrl}/api/webhooks/twilio/status?callId=${callId}`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
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
