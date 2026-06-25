import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { callsApi } from "../api";

type TestCallStatus = "idle" | "connecting" | "ready" | "ended" | "error";

type ServerMessage =
  | { type: "ready" }
  | { type: "play"; mime: string; audio: string }
  | { type: "stop_playback" }
  | { type: "speak_skipped" }
  | { type: "hangup" }
  | { type: "error"; message: string };

type ActiveTestCallContextValue = {
  callId: string | null;
  isTestCallActive: boolean;
  status: TestCallStatus;
  error: string | null;
  reply: string;
  setReply: (value: string) => void;
  sending: boolean;
  isPlaying: boolean;
  canRewind: boolean;
  rewinding: boolean;
  sendReply: () => void;
  skipSpeak: () => void;
  rewindStep: () => void;
};

const ActiveTestCallContext = createContext<ActiveTestCallContextValue | null>(null);

export function useActiveTestCall(): ActiveTestCallContextValue {
  const ctx = useContext(ActiveTestCallContext);
  if (!ctx) {
    return {
      callId: null,
      isTestCallActive: false,
      status: "idle",
      error: null,
      reply: "",
      setReply: () => {},
      sending: false,
      isPlaying: false,
      canRewind: false,
      rewinding: false,
      sendReply: () => {},
      skipSpeak: () => {},
      rewindStep: () => {},
    };
  }
  return ctx;
}

export function ActiveTestCallProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data: activeCall } = useQuery({
    queryKey: ["activeCall"],
    queryFn: callsApi.active,
    refetchInterval: 2000,
  });

  const [sessionCallId, setSessionCallId] = useState<string | null>(null);

  useEffect(() => {
    if (
      activeCall?.externalCallId?.startsWith("test-") &&
      (activeCall.status === "connected" ||
        activeCall.status === "dialing" ||
        activeCall.status === "ringing")
    ) {
      setSessionCallId(activeCall.id);
    }
  }, [activeCall?.id, activeCall?.externalCallId, activeCall?.status]);

  const testCallId = sessionCallId;

  const [status, setStatus] = useState<TestCallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [canRewind, setCanRewind] = useState(false);
  const [rewinding, setRewinding] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const intentionalCloseRef = useRef(false);

  const stopPlayback = useCallback(() => {
    playbackSourceRef.current?.stop();
    playbackSourceRef.current = null;
    setIsPlaying(false);
  }, []);

  const finishPlayback = useCallback(() => {
    playbackSourceRef.current = null;
    setIsPlaying(false);
    setSending(false);
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "playback_done" }));
    }
  }, []);

  const skipSpeak = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !isPlaying) return;
    stopPlayback();
    setSending(false);
    ws.send(JSON.stringify({ type: "skip_speak" }));
  }, [isPlaying, stopPlayback]);

  const rewindStep = useCallback(async () => {
    if (!testCallId || rewinding || sending) return;
    setRewinding(true);
    setError(null);
    try {
      stopPlayback();
      await callsApi.testRewind(testCallId);
      setSending(false);
      void qc.invalidateQueries({ queryKey: ["activeCall"] });
      void qc.invalidateQueries({ queryKey: ["call", testCallId] });
    } catch (err) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error ??
            "לא ניתן לחזור לשלב הקודם")
          : err instanceof Error
            ? err.message
            : "לא ניתן לחזור לשלב הקודם";
      setError(msg);
    } finally {
      setRewinding(false);
    }
  }, [rewinding, sending, stopPlayback, testCallId, qc]);

  const sendReply = useCallback(() => {
    const text = reply.trim();
    const ws = wsRef.current;
    if (!text || !ws || ws.readyState !== WebSocket.OPEN || sending || status !== "ready") return;
    setSending(true);
    ws.send(JSON.stringify({ type: "text", text }));
    setReply("");
  }, [reply, sending, status]);

  useEffect(() => {
    if (!testCallId || status !== "ready") {
      setCanRewind(false);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const { canRewind: ok } = await callsApi.canTestRewind(testCallId);
        if (!cancelled) setCanRewind(ok);
      } catch {
        if (!cancelled) setCanRewind(false);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [testCallId, status, sending, rewinding, isPlaying]);

  useEffect(() => {
    if (!testCallId) {
      intentionalCloseRef.current = true;
      stopPlayback();
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
      setStatus("idle");
      setError(null);
      setSending(false);
      setIsPlaying(false);
      return;
    }

    intentionalCloseRef.current = false;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      stopPlayback();
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
      stopPlayback();
      const node = ctx.createBufferSource();
      node.buffer = decoded;
      node.connect(ctx.destination);
      node.onended = () => {
        if (!cancelled) finishPlayback();
      };
      node.start();
      playbackSourceRef.current = node;
      setIsPlaying(true);
    }

    async function connect() {
      if (cancelled) return;
      setStatus("connecting");
      setError(null);

      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/test-call?callId=${testCallId}`);
        wsRef.current = ws;

        const connectTimer = setTimeout(() => {
          if (!cancelled && ws.readyState !== WebSocket.OPEN) {
            setError("תם הזמן לחיבור — ודאו שהשרת רץ");
            setStatus("error");
            ws.close();
          }
        }, 20_000);

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "start" }));
        };

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data as string) as ServerMessage;
          if (msg.type === "ready") {
            clearTimeout(connectTimer);
            setStatus("ready");
            setSending(false);
            return;
          }
          if (msg.type === "play") {
            void playMp3(msg.audio);
            return;
          }
          if (msg.type === "stop_playback") {
            stopPlayback();
            return;
          }
          if (msg.type === "speak_skipped") {
            finishPlayback();
            return;
          }
          if (msg.type === "hangup") {
            intentionalCloseRef.current = true;
            setStatus("ended");
            cleanup();
            setSessionCallId(null);
            void qc.invalidateQueries({ queryKey: ["activeCall"] });
            void qc.invalidateQueries({ queryKey: ["calls"] });
            return;
          }
          if (msg.type === "error") {
            setError(msg.message);
            setStatus("error");
            setSending(false);
            setIsPlaying(false);
          }
        };

        ws.onerror = () => {
          if (!cancelled) {
            setError("שגיאת חיבור לשיחת הטסט");
            setStatus("error");
            setSending(false);
            setIsPlaying(false);
          }
        };

        ws.onclose = () => {
          clearTimeout(connectTimer);
          if (cancelled || intentionalCloseRef.current) return;
          setStatus("connecting");
          reconnectTimer = setTimeout(() => {
            void connect();
          }, 1000);
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
      if (reconnectTimer) clearTimeout(reconnectTimer);
      intentionalCloseRef.current = true;
      cleanup();
    };
  }, [testCallId, finishPlayback, stopPlayback, qc]);

  const value: ActiveTestCallContextValue = {
    callId: testCallId,
    isTestCallActive: Boolean(testCallId),
    status,
    error,
    reply,
    setReply,
    sending,
    isPlaying,
    canRewind,
    rewinding,
    sendReply,
    skipSpeak,
    rewindStep,
  };

  return (
    <ActiveTestCallContext.Provider value={value}>{children}</ActiveTestCallContext.Provider>
  );
}

export function TestCallAudioPanel({ showWhenIdle = false }: { showWhenIdle?: boolean }) {
  const {
    isTestCallActive,
    status,
    error,
    reply,
    setReply,
    sending,
    isPlaying,
    sendReply,
    skipSpeak,
    canRewind,
    rewinding,
    rewindStep,
  } = useActiveTestCall();

  if (!isTestCallActive && !showWhenIdle) return null;

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
    idle: "אין שיחת טסט פעילה",
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
      {status === "ready" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded border border-emerald-600 bg-white px-3 py-1 text-sm text-emerald-800 hover:bg-emerald-100 disabled:opacity-40"
            onClick={() => void rewindStep()}
            disabled={!canRewind || rewinding || sending}
            title={canRewind ? "חזרה לשלב AI הקודם (טוען מחדש את הזרימה העדכנית)" : "אין שלב קודם"}
          >
            {rewinding ? "חוזר..." : "שלב AI קודם"}
          </button>
          {isPlaying && (
            <>
              <button
                type="button"
                className="rounded border border-emerald-600 bg-white px-3 py-1 text-sm text-emerald-800 hover:bg-emerald-100"
                onClick={skipSpeak}
              >
                דלג לסוף
              </button>
              <p className="text-xs text-emerald-700">
                עוצר את הדיבור בלבד — לא שולח תשובת לקוח.
              </p>
            </>
          )}
        </div>
      )}
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
      {sending && status === "ready" && !isPlaying && (
        <p className="mt-2 text-xs text-emerald-700">מעבד תשובה...</p>
      )}
    </div>
  );
}
