export interface DialResult {
  externalCallId: string;
  status: string;
}

export interface TelephonyProvider {
  name: string;
  dial(to: string, callId: string): Promise<DialResult>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}
