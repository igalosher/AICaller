import type { TelephonyProvider, DialResult } from "./provider.js";

export class MockTelephonyProvider implements TelephonyProvider {
  name = "mock";

  async dial(to: string, callId: string): Promise<DialResult> {
    return {
      externalCallId: `mock-${callId}`,
      status: "queued",
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "ספק טלפוניה מדומה פעיל (מצב פיתוח)" };
  }
}
