import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

type TestCallStatus = "connecting" | "ready" | "ended" | "error";

type ServerMessage =
  | { type: "ready" }
  | { type: "play"; mime: string; audio: string }
  | { type: "stop_playback" }
  | { type: "hangup" }
  | { type: "error"; message: string };

type Props = {
  callId: string;
};

export function TestCallAudio({ callId }: Props) {
  const [status, setStatus] = useState<TestCallStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const cleanup = () => {
      playbackSourceRef.current?.stop();
      playbackSourceRef.current = null;
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    };

    async function playMp3(base64: string) {
      const ctx = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = ctx;
      await ctx.resume();

      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0));
      playbackSourceRef.current?.stop();
      const node = ctx.createBufferSource();
      node.buffer = decoded;
      node.connect(ctx.destination);
      node.start();
      playbackSourceRef.current = node;
    }

    let connectTimer: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/test-call?callId=${callId}`);
        wsRef.current = ws;

        connectTimer = setTimeout(() => {
          if (!cancelled && ws.readyState !== WebSocket.OPEN) {
            setError("תם הזמן לחיבור — ודאו שהשרת רץ");
            setStatus("error");
            ws.close();
          }
        }, 20_000);

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "start" }));
        };

        ws.onmessage = async (event) => {
          const msg = JSON.parse(event.data as string) as ServerMessage;
          if (msg.type === "ready") {
            if (connectTimer) clearTimeout(connectTimer);
            setStatus("ready");
            setSending(false);
            return;
          }
          if (msg.type === "play") {
            await playMp3(msg.audio);
            setSending(false);
            return;
          }
          if (msg.type === "stop_playback") {
            playbackSourceRef.current?.stop();
            playbackSourceRef.current = null;
            return;
          }
          if (msg.type === "hangup") {
            endedRef.current = true;
            setStatus("ended");
            setSending(false);
            cleanup();
            return;
          }
          if (msg.type === "error") {
            setError(msg.message);
            setStatus("error");
            setSending(false);
          }
        };

        ws.onerror = () => {
          if (!cancelled) {
            setError("שגיאת חיבור לשיחת הטסט");
            setStatus("error");
            setSending(false);
          }
        };

        ws.onclose = () => {
          if (!cancelled && !endedRef.current) {
            setStatus("ended");
            setSending(false);
          }
        };
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "שגיאה בחיבור");
          setStatus("error");
        }
      }
    }

    void connect();

    return () => {
      cancelled = true;
      if (connectTimer) clearTimeout(connectTimer);
      cleanup();
    };
  }, [callId]);

  const sendReply = () => {
    const text = reply.trim();
    const ws = wsRef.current;
    if (!text || !ws || ws.readyState !== WebSocket.OPEN || sending || status !== "ready") return;
    setSending(true);
    ws.send(JSON.stringify({ type: "text", text }));
    setReply("");
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendReply();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  };

  const statusLabel: Record<TestCallStatus, string> = {
    connecting: "מתחבר לשיחת הטסט...",
    ready: "שיחת טסט פעילה — הקלידו תשובה ולחצו Enter",
    ended: "שיחת הטסט הסתיימה",
    error: "שגיאה",
  };

  const canReply = status === "ready" && !sending;

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        status === "error"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      <p className="font-medium">שיחת טסט (רמקול + הקלדה)</p>
      <p className="mt-1">{error ?? statusLabel[status]}</p>
      {canReply && (
        <form className="mt-3 flex gap-2" onSubmit={onSubmit}>
          <input
            type="text"
            className="min-w-0 flex-1 rounded border border-emerald-300 bg-white px-3 py-2 text-sm text-slate-900"
            placeholder="הקלידו את תשובת הלקוח..."
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={sending}
            autoFocus
            dir="rtl"
          />
          <button
            type="submit"
            className="shrink-0 rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={!reply.trim() || sending}
          >
            שלח
          </button>
        </form>
      )}
      {sending && status === "ready" && (
        <p className="mt-2 text-xs text-emerald-700">מעבד תשובה...</p>
      )}
    </div>
  );
}
