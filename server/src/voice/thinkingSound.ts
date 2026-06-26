/** Rising-tone hold music (8 kHz μ-law) while the AI generates a reply. */
const SAMPLE_RATE = 8000;
const CHUNK_BYTES = 160; // 20 ms @ 8 kHz

const RISING_FREQS = [392, 494, 587]; // G4 → B4 → D5
const NOTE_MS = 200;
const STEP_MS = 750;

function linearToMulaw(sample: number): number {
  const MULAW_MAX = 0x1fff;
  const MULAW_BIAS = 33;
  let sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  if (sample > MULAW_MAX) sample = MULAW_MAX;
  sample += MULAW_BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {
    // find segment
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

function mulawSilence(): number {
  return linearToMulaw(0);
}

function generateThinkingLoopMulaw(): Buffer {
  const cycleMs = STEP_MS * RISING_FREQS.length;
  const samples = Math.floor((SAMPLE_RATE * cycleMs) / 1000);
  const buffer = Buffer.alloc(samples);
  const noteSamples = Math.floor((SAMPLE_RATE * NOTE_MS) / 1000);
  const stepSamples = Math.floor((SAMPLE_RATE * STEP_MS) / 1000);

  for (let i = 0; i < samples; i++) {
    const posInCycle = i % (stepSamples * RISING_FREQS.length);
    const step = Math.floor(posInCycle / stepSamples);
    const posInNote = posInCycle - step * stepSamples;

    if (posInNote >= noteSamples) {
      buffer[i] = mulawSilence();
      continue;
    }

    const freq = RISING_FREQS[step] ?? RISING_FREQS[0];
    const t = posInNote / SAMPLE_RATE;
    const attack = Math.min(1, posInNote / (SAMPLE_RATE * 0.02));
    const release = Math.min(1, (noteSamples - posInNote) / (SAMPLE_RATE * 0.04));
    const env = attack * release * 0.22;
    const sample = Math.sin(2 * Math.PI * freq * t) * env;
    buffer[i] = linearToMulaw(Math.round(sample * 32767));
  }
  return buffer;
}

export const THINKING_LOOP_MULAW = generateThinkingLoopMulaw();
const THINKING_LOOP = THINKING_LOOP_MULAW;

export type ThinkingSession = {
  stop: () => void;
};

export function streamThinkingMulaw(
  sendChunk: (chunk: Buffer) => boolean,
  shouldStop: () => boolean,
): ThinkingSession {
  let offset = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = () => {
    if (stopped || shouldStop()) return;
    const chunk = Buffer.alloc(CHUNK_BYTES);
    for (let i = 0; i < CHUNK_BYTES; i++) {
      chunk[i] = THINKING_LOOP[offset] ?? mulawSilence();
      offset = (offset + 1) % THINKING_LOOP.length;
    }
    if (stopped || shouldStop()) return;
    if (!sendChunk(chunk)) {
      stopped = true;
      return;
    }
    if (stopped || shouldStop()) return;
    timer = setTimeout(tick, 20);
  };

  tick();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
