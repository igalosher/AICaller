import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { callFlowsApi } from "../api";
import type { FlowGraph } from "../types";

export type AiChatMessage = {
  role: "user" | "assistant" | "error";
  text: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  getCurrentGraph: () => FlowGraph;
  onBeforeApply: (snapshot: FlowGraph) => void;
  onApply: (graph: FlowGraph, affectedNodeIds: string[], summaryHe: string) => void;
  undoCount: number;
  onUndo: () => void;
  canUndo: boolean;
};

export function FlowAiAssistantPanel({
  open,
  onClose,
  getCurrentGraph,
  onBeforeApply,
  onApply,
  undoCount,
  onUndo,
  canUndo,
}: Props) {
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      role: "assistant",
      text: "שלום! אני עוזרת לערוך את זרימת השיחה. אפשר לבקש להוסיף שלב, לשנות ניסוח, או לחבר קשתות.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState({ x: 24, y: 120 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
        y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);
    try {
      const snapshot = structuredClone(getCurrentGraph());
      const result = await callFlowsApi.aiEdit(text, snapshot);
      onBeforeApply(snapshot);
      onApply(result.draftGraph, result.affectedNodeIds, result.summaryHe);
      setMessages((prev) => [...prev, { role: "assistant", text: result.summaryHe }]);
    } catch (err) {
      const data =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: string; details?: unknown } } }).response?.data
          : undefined;
      const detail =
        Array.isArray(data?.details) && data.details.length > 0
          ? ` (${JSON.stringify(data.details[0])})`
          : "";
      const msg =
        data?.error ??
        (err instanceof Error ? err.message : null) ??
        "שגיאה בעריכת הזרימה — ודאו שהשרת רץ";
      setMessages((prev) => [...prev, { role: "error", text: `${msg}${detail}` }]);
    } finally {
      setLoading(false);
    }
  }, [getCurrentGraph, input, loading, onApply, onBeforeApply]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed z-40 flex w-[min(420px,calc(100vw-2rem))] flex-col rounded-xl border border-violet-300 bg-white shadow-2xl"
      style={{ left: pos.x, top: pos.y, maxHeight: "min(70vh, 520px)" }}
      dir="rtl"
    >
      <div
        className="flex cursor-move items-center justify-between gap-2 rounded-t-xl bg-violet-700 px-4 py-2 text-white"
        onMouseDown={(e) => {
          dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
        }}
      >
        <span className="font-semibold">עוזר AI לזרימה</span>
        <button type="button" className="text-sm underline" onClick={onClose}>
          סגור
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3 text-sm">
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`rounded-lg px-3 py-2 ${
              m.role === "user"
                ? "mr-4 bg-violet-100 text-violet-950"
                : m.role === "error"
                  ? "bg-red-50 text-red-800"
                  : "ml-4 bg-slate-100 text-slate-800"
            }`}
          >
            {m.text}
          </div>
        ))}
        {loading && <p className="text-xs text-slate-500">מעבדת את הבקשה...</p>}
      </div>

      <div className="border-t border-slate-200 px-3 py-2">
        <button
          type="button"
          className="mb-2 rounded border border-violet-400 px-2 py-1 text-xs text-violet-800 disabled:opacity-40"
          onClick={onUndo}
          disabled={!canUndo}
          title={canUndo ? `ניתן לבטל ${undoCount} שינויים` : "ביטול לא זמין"}
        >
          בטל שינוי אחרון{canUndo ? ` (${undoCount})` : ""}
        </button>
        {!canUndo && (
          <p className="mb-2 text-xs text-slate-500">ביטול לא זמין — אין שינויי AI לביטול או בוצעו עריכות ידניות</p>
        )}
        <form onSubmit={onSubmit} className="flex gap-2">
          <textarea
            className="min-h-[2.5rem] flex-1 resize-y rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="למשל: הוסיפי שאלה על המחיר אחרי הספק..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
            rows={2}
          />
          <button
            type="submit"
            className="shrink-0 self-end rounded bg-violet-700 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={loading || !input.trim()}
          >
            שלח
          </button>
        </form>
      </div>
    </div>
  );
}
