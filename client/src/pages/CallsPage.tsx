import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { callsApi, connectCallEvents } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import type { TranscriptSegment } from "../types";
import { contactDisplayName } from "../types";

function getErrorMessage(err: unknown): string {
  if (isAxiosError(err) && err.response?.data?.error) {
    return String(err.response.data.error);
  }
  return "שגיאה בהפעלת השיחה";
}

function segmentKey(speaker: string, text: string): string {
  return `${speaker}:${text}`;
}

function mergeTranscript(
  persisted: TranscriptSegment[],
  live: { speaker: string; text: string }[],
): { speaker: string; text: string }[] {
  const seen = new Set(persisted.map((t) => segmentKey(t.speaker, t.text)));
  const merged = persisted.map((t) => ({ speaker: t.speaker, text: t.text }));
  for (const item of live) {
    const key = segmentKey(item.speaker, item.text);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

export function CallsPage() {
  const qc = useQueryClient();
  const [liveTranscript, setLiveTranscript] = useState<{ speaker: string; text: string }[]>([]);
  const [callError, setCallError] = useState<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const { data: calls } = useQuery({ queryKey: ["calls"], queryFn: callsApi.list });
  const { data: activeCall } = useQuery({
    queryKey: ["activeCall"],
    queryFn: callsApi.active,
    refetchInterval: 2000,
  });

  const displayTranscript = useMemo(
    () => mergeTranscript(activeCall?.transcript ?? [], liveTranscript),
    [activeCall?.transcript, liveTranscript],
  );

  const nextMutation = useMutation({
    mutationFn: callsApi.next,
    onMutate: () => setCallError(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calls"] });
      qc.invalidateQueries({ queryKey: ["activeCall"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => setCallError(getErrorMessage(err)),
  });

  useEffect(() => {
    setLiveTranscript([]);
  }, [activeCall?.id]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [displayTranscript]);

  useEffect(() => {
    const ws = connectCallEvents((event) => {
      const e = event as { type: string; speaker?: string; text?: string };
      if (e.type === "transcript" && e.speaker && e.text) {
        setLiveTranscript((prev) => {
          const last = prev[prev.length - 1];
          if (last?.speaker === e.speaker && last?.text === e.text) return prev;
          const key = segmentKey(e.speaker!, e.text!);
          if (prev.some((t) => segmentKey(t.speaker, t.text) === key)) return prev;
          return [...prev, { speaker: e.speaker!, text: e.text! }];
        });
      }
      if (e.type === "call_ended") {
        setLiveTranscript([]);
        qc.invalidateQueries({ queryKey: ["calls"] });
        qc.invalidateQueries({ queryKey: ["activeCall"] });
      }
      if (e.type === "call_status") {
        qc.invalidateQueries({ queryKey: ["calls"] });
        qc.invalidateQueries({ queryKey: ["activeCall"] });
      }
    });
    return () => ws.close();
  }, [qc]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">שיחות</h2>
        <button
          className="rounded-lg bg-blue-600 px-4 py-2 text-white"
          onClick={() => nextMutation.mutate()}
        >
          התקשר לבא בתור
        </button>
      </div>

      {callError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {callError}
        </div>
      )}

      {activeCall && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h3 className="font-semibold">
            שיחה פעילה —{" "}
            {activeCall.contact
              ? contactDisplayName(activeCall.contact)
              : "—"}
          </h3>
          <p className="text-sm">שלב: {activeCall.currentStage ?? "—"}</p>
          <div className="mt-3 max-h-48 overflow-y-auto rounded-lg bg-white p-3 text-sm">
            {displayTranscript.map((t, i) => (
              <p key={`${t.speaker}-${i}-${t.text.slice(0, 24)}`}>
                <strong>{t.speaker === "ai" ? "AI" : "לקוח"}:</strong> {t.text}
              </p>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-right">איש קשר</th>
              <th className="px-4 py-3 text-right">סטטוס</th>
              <th className="px-4 py-3 text-right">תוצאה</th>
              <th className="px-4 py-3 text-right">משך</th>
              <th className="px-4 py-3 text-right">תאריך</th>
            </tr>
          </thead>
          <tbody>
            {calls?.items.map((call) => (
              <tr key={call.id} className="border-t">
                <td className="px-4 py-3">
                  {call.contact ? contactDisplayName(call.contact) : "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={call.status} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={call.outcome} />
                </td>
                <td className="px-4 py-3">{call.durationSec ? `${call.durationSec}ש׳` : "—"}</td>
                <td className="px-4 py-3">{new Date(call.startedAt).toLocaleString("he-IL")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
