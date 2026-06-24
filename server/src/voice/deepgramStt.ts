import WebSocket from "ws";
import { logger } from "../logger.js";

export type TranscriptHandler = (text: string, isFinal: boolean) => void;

export type DeepgramAudioConfig = {
  encoding?: string;
  sampleRate?: number;
};

export class DeepgramSttSession {
  private ws: WebSocket | null = null;
  private closed = false;

  constructor(
    private apiKey: string,
    private onTranscript: TranscriptHandler,
    private audioConfig: DeepgramAudioConfig = {},
  ) {}

  async connect(): Promise<void> {
    const encoding = this.audioConfig.encoding ?? "mulaw";
    const sampleRate = this.audioConfig.sampleRate ?? 8000;
    const params = new URLSearchParams({
      encoding,
      sample_rate: String(sampleRate),
      channels: "1",
      model: "nova-3",
      language: "he",
      punctuate: "true",
      interim_results: "true",
      endpointing: "500",
      utterance_end_ms: "1200",
      smart_format: "true",
    });

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, {
        headers: { Authorization: `Token ${this.apiKey}` },
      });

      this.ws.on("open", () => resolve());
      this.ws.on("error", (err) => {
        logger.error({ err }, "Deepgram STT connection error");
        reject(err);
      });
      this.ws.on("message", (data) => this.handleMessage(data.toString()));
      this.ws.on("close", () => {
        this.closed = true;
      });
    });
  }

  private handleMessage(raw: string) {
    try {
      const message = JSON.parse(raw) as {
        type?: string;
        is_final?: boolean;
        speech_final?: boolean;
        channel?: { alternatives?: { transcript?: string }[] };
      };
      if (message.type !== "Results") return;

      const text = message.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
      if (!text) return;

      const isFinal = Boolean(message.is_final || message.speech_final);
      this.onTranscript(text, isFinal);
    } catch {
      // ignore malformed frames
    }
  }

  sendAudio(chunk: Buffer): void {
    if (this.closed || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(chunk);
  }

  close(): void {
    this.closed = true;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "CloseStream" }));
      this.ws.close();
    }
    this.ws = null;
  }
}
