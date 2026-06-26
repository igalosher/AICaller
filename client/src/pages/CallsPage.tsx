import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { callsApi, connectCallEvents, intentsApi } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { TestCallAudioPanel } from "../context/ActiveTestCallContext";
import type { Call, TranscriptSegment } from "../types";
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

type LiveSegment = {
  speaker: string;
  text: string;
  segmentId?: string;
  flowNodeId?: string;
  intentId?: string;
  confidence?: number;
  classifier?: string;
  debugJson?: string | null;
};

function mergeTranscript(
  persisted: TranscriptSegment[],
  live: LiveSegment[],
): LiveSegment[] {
  const seen = new Set(persisted.map((t) => segmentKey(t.speaker, t.text)));
  const merged: LiveSegment[] = persisted.map((t) => ({
    speaker: t.speaker,
    text: t.text,
    segmentId: t.id,
    flowNodeId: t.flowNodeId ?? undefined,
    intentId: t.classification?.intentId,
    confidence: t.classification?.confidence,
    classifier: t.classification?.classifier,
    debugJson: t.classification?.debugJson,
  }));
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
  const [liveTranscript, setLiveTranscript] = useState<LiveSegment[]>([]);
  const [callError, setCallError] = useState<string | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [debugSegment, setDebugSegment] = useState<LiveSegment | null>(null);
  const [relabelIntent, setRelabelIntent] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const { data: calls } = useQuery({ queryKey: ["calls"], queryFn: callsApi.list });
  const { data: activeCall } = useQuery({
    queryKey: ["activeCall"],
    queryFn: callsApi.active,
    refetchInterval: 2000,
  });
  const { data: selectedCall } = useQuery({
    queryKey: ["call", selectedCallId],
    queryFn: () => callsApi.get(selectedCallId!),
    enabled: !!selectedCallId,
  });
  const { data: intents } = useQuery({ queryKey: ["intents"], queryFn: intentsApi.list });

  const displayCall = activeCall ?? selectedCall;
  const displayTranscript = useMemo(
    () =>
      mergeTranscript(
        displayCall?.transcript ?? [],
        displayCall?.id === activeCall?.id ? liveTranscript : [],
      ),
    [displayCall?.transcript, displayCall?.id, activeCall?.id, liveTranscript],
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

  const relabelMutation = useMutation({
    mutationFn: () =>
      intentsApi.relabel(debugSegment!.segmentId!, relabelIntent, true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["call", selectedCallId] });
      qc.invalidateQueries({ queryKey: ["activeCall"] });
      qc.invalidateQueries({ queryKey: ["intents"] });
      setDebugSegment(null);
    },
  });

  useEffect(() => {
    setLiveTranscript([]);
  }, [activeCall?.id]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [displayTranscript]);

  useEffect(() => {
    const ws = connectCallEvents((event) => {
      const e = event as {
        type: string;
        speaker?: string;
        text?: string;
        segmentId?: string;
        flowNodeId?: string;
        intentId?: string;
        confidence?: number;
      };
      if (e.type === "transcript" && e.speaker && e.text) {
        setLiveTranscript((prev) => {
          const last = prev[prev.length - 1];
          if (last?.speaker === e.speaker && last?.text === e.text) return prev;
          const key = segmentKey(e.speaker!, e.text!);
          if (prev.some((t) => segmentKey(t.speaker, t.text) === key)) return prev;
          return [...prev, { speaker: e.speaker!, text: e.text!, flowNodeId: e.flowNodeId }];
        });
      }
      if (e.type === "classification" && e.segmentId) {
        setLiveTranscript((prev) => {
          const idx = prev.findIndex(
            (t) => t.speaker === "customer" && !t.segmentId,
          );
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = {
              ...copy[idx]!,
              segmentId: e.segmentId,
              intentId: e.intentId,
              confidence: e.confidence,
            };
            return copy;
          }
          return prev;
        });
        qc.invalidateQueries({ queryKey: ["activeCall"] });
      }
      if (e.type === "call_ended") {
        setLiveTranscript([]);
        qc.invalidateQueries({ queryKey: ["calls"] });
        qc.invalidateQueries({ queryKey: ["activeCall"] });
      }
      if (e.type === "call_status") {
        if (e.status === "busy") {
          setCallError(
            "הקו תפוס או שהשיחה נדחתה. ודא שהטלפון פנוי, ענה מהר כשמצלצל, ואל תחסום שיחות מחו״ל.",
          );
        }
        qc.invalidateQueries({ queryKey: ["calls"] });
        qc.invalidateQueries({ queryKey: ["activeCall"] });
      }
    });
    return () => ws.close();
  }, [qc]);

  const hangUpMutation = useMutation({
    mutationFn: (callId: string) => callsApi.hangUp(callId),
    onMutate: () => setCallError(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calls"] });
      qc.invalidateQueries({ queryKey: ["activeCall"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => setCallError(getErrorMessage(err)),
  });

  const isActiveCallLive =
    activeCall &&
    (activeCall.status === "connected" ||
      activeCall.status === "dialing" ||
      activeCall.status === "ringing");

  const intentLabel = (intentId?: string) =>
    intents?.find((i) => i.id === intentId)?.labelHe ?? intentId ?? "—";

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

      {displayCall && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">
              {activeCall ? "שיחה פעילה" : "פרטי שיחה"} —{" "}
              {displayCall.contact ? contactDisplayName(displayCall.contact) : "—"}
            </h3>
            <div className="flex items-center gap-2">
              <StatusBadge status={displayCall.status} />
              {isActiveCallLive && (
                <button
                  type="button"
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60"
                  disabled={hangUpMutation.isPending}
                  onClick={() => hangUpMutation.mutate(activeCall!.id)}
                >
                  {hangUpMutation.isPending ? "מנתק..." : "נתק שיחה"}
                </button>
              )}
            </div>
          </div>
          {activeCall?.externalCallId?.startsWith("test-") && (
            <div className="mb-3">
              <TestCallAudioPanel />
            </div>
          )}
          <p className="text-sm">
            צומת: {displayCall.currentNodeId ?? displayCall.currentStage ?? "—"}
          </p>
          <div className="mt-3 max-h-64 overflow-y-auto rounded-lg bg-white p-3 text-sm">
            {displayTranscript.map((t, i) => (
              <div key={`${t.speaker}-${i}-${t.text.slice(0, 24)}`} className="mb-2 border-b pb-2">
                <p className="break-words">
                  <strong>{t.speaker === "ai" ? "AI" : "לקוח"}:</strong> {t.text}
                </p>
                {t.flowNodeId && (
                  <div className="mt-1">
                    <Link
                      to={`/flow-builder?focus=${encodeURIComponent(t.flowNodeId)}`}
                      className="text-xs text-blue-600 underline"
                    >
                      {t.speaker === "ai" ? "ערוך בזרימה" : "צומת האזנה בזרימה"}
                    </Link>
                  </div>
                )}
                {t.speaker === "customer" && t.intentId && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-800">
                      {intentLabel(t.intentId)} ({Math.round((t.confidence ?? 0) * 100)}%)
                    </span>
                    {t.segmentId && (
                      <button
                        className="text-xs text-blue-600 underline"
                        onClick={() => {
                          setDebugSegment(t);
                          setRelabelIntent(t.intentId ?? "");
                        }}
                      >
                        פרטים / תיקון
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      )}

      {debugSegment && (
        <div className="rounded-xl border bg-white p-4 text-sm">
          <h4 className="mb-2 font-semibold">פרטי סיווג</h4>
          <p>מסווג: {debugSegment.classifier ?? "—"}</p>
          <p>כוונה: {intentLabel(debugSegment.intentId)}</p>
          {debugSegment.debugJson && (
            <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-xs">
              {debugSegment.debugJson}
            </pre>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              className="rounded border px-2 py-1"
              value={relabelIntent}
              onChange={(e) => setRelabelIntent(e.target.value)}
            >
              {intents?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.labelHe}
                </option>
              ))}
            </select>
            <button
              className="rounded bg-blue-600 px-3 py-1 text-white"
              onClick={() => relabelMutation.mutate()}
            >
              שמור כוונה + הוסף כדוגמה
            </button>
            <button className="rounded border px-3 py-1" onClick={() => setDebugSegment(null)}>
              סגור
            </button>
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
            {calls?.items.map((call: Call) => (
              <tr
                key={call.id}
                className={`cursor-pointer border-t hover:bg-slate-50 ${selectedCallId === call.id ? "bg-blue-50" : ""}`}
                onClick={() => setSelectedCallId(call.id)}
              >
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
