import { logger } from "../logger.js";

export function logLatency(metric: string, ms: number, callId?: string): void {
  logger.info({ metric, ms, callId }, "voice_latency");
}

export async function timed<T>(
  metric: string,
  callId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    logLatency(metric, Math.round(performance.now() - start), callId);
  }
}
