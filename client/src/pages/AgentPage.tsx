import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DEFAULT_AGENT_CONFIG } from "../agentDefaults";
import { agentApi } from "../api";
import type {
  AgentConfig,
  AgentConfigPatchField,
  AgentConfigVersionSummary,
  AgentInstructionDraft,
  AgentResponseExample,
} from "../types";
import { useConversationMode } from "../context/ConversationModeContext";
import { isAxiosError } from "axios";

function loadErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    if (err.code === "ERR_NETWORK") return "לא ניתן להתחבר לשרת. הפעל npm run dev (או dev:twilio) ורענן.";
    if (err.response?.status === 404) {
      return "נתיב הסוכן לא נמצא בשרת — הפעל מחדש את השרת לאחר עדכון הקוד.";
    }
  }
  return "שגיאה בטעינת הגדרות הסוכן מהשרת";
}

const VERSION_SOURCE_LABELS: Record<string, string> = {
  manual_save: "שמירה ידנית",
  restore: "שחזור גרסה",
  draft_approval: "אישור טיוטה",
};

const PATCH_FIELD_LABELS: Record<AgentConfigPatchField, string> = {
  missionHe: "משימה",
  limitsHe: "מגבלות",
  policiesHe: "מדיניות",
};

function draftSummary(draft: AgentInstructionDraft): string {
  try {
    const payload = JSON.parse(draft.payloadJson) as Record<string, string>;
    if (draft.kind === "response_example") {
      return `תגובה מתוקנת: ${payload.correctedText?.slice(0, 80) ?? ""}`;
    }
    if (draft.kind === "config_patch") {
      const field = payload.field as AgentConfigPatchField;
      return `עדכון ${PATCH_FIELD_LABELS[field] ?? payload.field}: ${payload.appendText?.slice(0, 80) ?? ""}`;
    }
  } catch {
    // ignore
  }
  return draft.kind;
}

export function AgentPage() {
  const qc = useQueryClient();
  const { mode } = useConversationMode();
  const { data: config, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["agentConfig"],
    queryFn: agentApi.getConfig,
    retry: 1,
    staleTime: 30_000,
    placeholderData: DEFAULT_AGENT_CONFIG,
  });
  const { data: examplesData } = useQuery({
    queryKey: ["agentExamples"],
    queryFn: agentApi.listExamples,
  });
  const { data: versionsData } = useQuery({
    queryKey: ["agentVersions"],
    queryFn: agentApi.listVersions,
  });
  const { data: draftsData } = useQuery({
    queryKey: ["agentDrafts"],
    queryFn: agentApi.listDrafts,
  });

  const [draft, setDraft] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [previewConfig, setPreviewConfig] = useState<AgentConfig | null>(null);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: agentApi.saveConfig,
    onSuccess: (data) => {
      qc.setQueryData(["agentConfig"], data);
      setDraft(data);
      void qc.invalidateQueries({ queryKey: ["agentVersions"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: agentApi.restoreVersion,
    onSuccess: (data) => {
      qc.setQueryData(["agentConfig"], data);
      setDraft(data);
      void qc.invalidateQueries({ queryKey: ["agentVersions"] });
      setPreviewVersionId(null);
      setPreviewConfig(null);
    },
  });

  const approveDraftMutation = useMutation({
    mutationFn: agentApi.approveDraft,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agentDrafts"] });
      void qc.invalidateQueries({ queryKey: ["agentExamples"] });
      void qc.invalidateQueries({ queryKey: ["agentConfig"] });
      void qc.invalidateQueries({ queryKey: ["agentVersions"] });
    },
  });

  const discardDraftMutation = useMutation({
    mutationFn: agentApi.discardDraft,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["agentDrafts"] }),
  });

  const deleteExampleMutation = useMutation({
    mutationFn: agentApi.deleteExample,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agentExamples"] }),
  });

  const examples = examplesData?.items ?? [];
  const versions = versionsData?.items ?? [];
  const pendingDrafts = draftsData?.items ?? [];

  async function loadVersionPreview(id: string) {
    setPreviewVersionId(id);
    const detail = await agentApi.getVersion(id);
    setPreviewConfig(detail.config);
  }

  function confirmRestore(version: AgentConfigVersionSummary) {
    const ok = window.confirm(
      `לשחזר גרסה ${version.versionNumber}? ההגדרות הפעילות יוחלפו (תיווצר גרסה חדשה).`,
    );
    if (ok) restoreMutation.mutate(version.id);
  }

  if (isLoading && !config) {
    return <p className="text-slate-600">טוען הגדרות סוכן...</p>;
  }

  return (
    <div className="space-y-6">
      {isError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadErrorMessage(error)} מוצגות הגדרות ברירת מחדל מקומית — שמירה תעבוד כשהשרת זמין.
          <button type="button" className="mr-2 underline" onClick={() => void refetch()}>
            נסה שוב
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">סוכן מכירות (Sigal)</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            במצב סוכן, השיחה מתנהלת באופן אוטונומי לפי משימה, מגבלות וקטלוג המוצרים. משוב משיחות
            נשמר כטיוטה עד שתאשרו כאן.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            mode === "agent" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"
          }`}
        >
          {mode === "agent" ? "מצב סוכן פעיל לשיחות חדשות" : "שיחות חדשות ישתמשו במצב זרימה"}
        </span>
      </div>

      {pendingDrafts.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold text-amber-900">טיוטות ממתינות ({pendingDrafts.length})</h3>
          <p className="mb-4 text-xs text-amber-800">
            משוב משיחות — לא משפיע על הסוכן עד אישור.
          </p>
          <div className="space-y-3">
            {pendingDrafts.map((d) => (
              <div key={d.id} className="rounded-lg border border-amber-100 bg-white p-4 text-sm">
                <p className="font-medium text-slate-900">{draftSummary(d)}</p>
                {d.operatorNote && (
                  <p className="mt-1 text-slate-600">
                    <strong>הערה:</strong> {d.operatorNote}
                  </p>
                )}
                {d.callId && (
                  <p className="mt-1 text-xs text-slate-500">
                    <Link to="/calls" className="text-violet-700 underline">
                      שיחה {d.callId.slice(0, 8)}…
                    </Link>
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                    disabled={approveDraftMutation.isPending}
                    onClick={() => approveDraftMutation.mutate(d.id)}
                  >
                    אשר
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-50"
                    disabled={discardDraftMutation.isPending}
                    onClick={() => discardDraftMutation.mutate(d.id)}
                  >
                    מחק טיוטה
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold text-violet-800">משימה ומטרה</h3>
          <p className="mb-2 text-xs text-slate-500">מה הסוכן צריך להשיג בשיחה — גילוי צרכים, התאמת חבילה, סגירה.</p>
          <textarea
            className="min-h-36 w-full rounded-lg border border-slate-200 p-3 text-sm leading-relaxed"
            value={draft.missionHe}
            onChange={(e) => setDraft({ ...draft, missionHe: e.target.value })}
          />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold text-red-700">מגבלות קשיחות</h3>
          <p className="mb-2 text-xs text-slate-500">חוקים שלא ניתן לעבור — קטלוג בלבד, הסר, איסור הבטחות.</p>
          <textarea
            className="min-h-36 w-full rounded-lg border border-slate-200 p-3 text-sm leading-relaxed"
            value={draft.limitsHe}
            onChange={(e) => setDraft({ ...draft, limitsHe: e.target.value })}
          />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold text-amber-800">מדיניות ואופן דיבור</h3>
          <p className="mb-2 text-xs text-slate-500">טון, התמודדות עם סירוב, מתי ללחוץ ומתי לסיים.</p>
          <textarea
            className="min-h-32 w-full rounded-lg border border-slate-200 p-3 text-sm leading-relaxed"
            value={draft.policiesHe}
            onChange={(e) => setDraft({ ...draft, policiesHe: e.target.value })}
          />
          <label className="mt-4 block text-sm font-medium text-slate-700">
            סירובים לפני סיום מנומס
            <input
              type="number"
              min={1}
              max={5}
              className="mt-1 w-20 rounded border px-2 py-1"
              value={draft.maxRejections}
              onChange={(e) => setDraft({ ...draft, maxRejections: Number(e.target.value) })}
            />
          </label>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold text-blue-800">פתיחת שיחה</h3>
          <p className="mb-2 text-xs text-slate-500">
            השתמשי ב-{"{{customer_full_name}}"} ו-{"{{g:זכר|נקבה}}"} לשם ולמין הלקוח.
          </p>
          <textarea
            className="min-h-32 w-full rounded-lg border border-slate-200 p-3 text-sm leading-relaxed"
            value={draft.openingTemplateHe}
            onChange={(e) => setDraft({ ...draft, openingTemplateHe: e.target.value })}
          />
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate(draft)}
          className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {saveMutation.isPending ? "שומר..." : "שמור הגדרות סוכן"}
        </button>
        {config?.currentVersionNumber != null && (
          <span className="text-sm text-slate-600">גרסה פעילה: {config.currentVersionNumber}</span>
        )}
        {saved && <span className="text-sm text-emerald-600">נשמר בהצלחה</span>}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-lg font-semibold text-slate-900">היסטוריית גרסאות</h3>
        {versions.length === 0 ? (
          <p className="text-sm text-slate-500">אין גרסאות שמורות עדיין — שמירה ראשונה תיצור גרסה 1.</p>
        ) : (
          <div className="space-y-2">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">גרסה {v.versionNumber}</span>
                  <span className="mr-2 text-xs text-slate-500">
                    {VERSION_SOURCE_LABELS[v.source] ?? v.source} ·{" "}
                    {new Date(v.createdAt).toLocaleString("he-IL")}
                  </span>
                  {v.label && <span className="block text-xs text-slate-600">{v.label}</span>}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-blue-600 underline"
                    onClick={() => void loadVersionPreview(v.id)}
                  >
                    תצוגה
                  </button>
                  <button
                    type="button"
                    className="text-xs text-violet-700 underline disabled:opacity-40"
                    disabled={restoreMutation.isPending}
                    onClick={() => confirmRestore(v)}
                  >
                    שחזר
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {previewConfig && previewVersionId && (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-xs">
            <p className="mb-2 font-semibold text-blue-900">תצוגה מקדימה</p>
            <p className="whitespace-pre-wrap text-slate-800">{previewConfig.missionHe.slice(0, 200)}…</p>
            <button
              type="button"
              className="mt-2 text-xs text-slate-600 underline"
              onClick={() => {
                setPreviewVersionId(null);
                setPreviewConfig(null);
              }}
            >
              סגור
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">דוגמאות למידה (מאושרות)</h3>
            <p className="text-xs text-slate-500">דוגמאות שאושרו ומשמשות את הסוכן בתגובות דומות.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            {examples.length} דוגמאות
          </span>
        </div>

        {examples.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
            עדיין אין דוגמאות מאושרות. שלחו משוב משיחה ואשרו טיוטה למעלה.
          </p>
        ) : (
          <div className="space-y-3">
            {examples.map((ex: AgentResponseExample) => (
              <div key={ex.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm">
                <p>
                  <strong>לקוח:</strong> {ex.customerText}
                </p>
                {ex.aiResponseBad && (
                  <p className="mt-1 text-red-700">
                    <strong>תגובה שגויה:</strong> {ex.aiResponseBad}
                  </p>
                )}
                <p className="mt-1 text-emerald-800">
                  <strong>תגובה מומלצת:</strong> {ex.correctedText}
                </p>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="text-xs text-red-600 underline"
                    onClick={() => deleteExampleMutation.mutate(ex.id)}
                  >
                    מחק
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
