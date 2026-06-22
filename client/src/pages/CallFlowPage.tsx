import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { callFlowsApi } from "../api";

export function CallFlowPage() {
  const qc = useQueryClient();
  const { data: flow } = useQuery({ queryKey: ["callFlow"], queryFn: callFlowsApi.active });
  const [openingTemplate, setOpeningTemplate] = useState("");
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (flow) setOpeningTemplate(flow.openingTemplate);
  }, [flow]);

  const previewMutation = useMutation({
    mutationFn: () => callFlowsApi.previewOpening(openingTemplate, "דוד כהן"),
    onSuccess: (data) => setPreview(data.preview),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!flow) throw new Error("no flow");
      return callFlowsApi.save({
        openingTemplate,
        stages: JSON.parse(flow.stagesJson),
        objections: JSON.parse(flow.objectionsJson),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["callFlow"] }),
  });

  const stages = flow ? (JSON.parse(flow.stagesJson) as { id: string; prompt: string }[]) : [];
  const objections = flow
    ? (JSON.parse(flow.objectionsJson) as Record<string, string>)
    : {};

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">זרימת שיחה</h2>

      <div className="rounded-xl border bg-white p-4">
        <label className="mb-2 block text-sm font-medium">שורת פתיחה (השתמש ב-{"{{customer_name}}"})</label>
        <textarea
          className="w-full rounded-lg border px-3 py-2"
          rows={3}
          value={openingTemplate}
          onChange={(e) => setOpeningTemplate(e.target.value)}
        />
        <div className="mt-3 flex gap-2">
          <button
            className="rounded-lg border px-4 py-2"
            onClick={() => previewMutation.mutate()}
          >
            תצוגה מקדימה
          </button>
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-white"
            onClick={() => saveMutation.mutate()}
          >
            שמור גרסה חדשה
          </button>
        </div>
        {preview && (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
            <strong>תצוגה מקדימה:</strong> {preview}
          </p>
        )}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h3 className="mb-3 font-semibold">שלבי שיחה</h3>
        <ol className="space-y-2">
          {stages.map((stage, i) => (
            <li key={stage.id} className="rounded-lg bg-slate-50 p-3">
              <span className="font-medium">{i + 1}. {stage.id}</span>
              <p className="text-sm text-slate-600">{stage.prompt}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h3 className="mb-3 font-semibold">טיפול בהתנגדויות</h3>
        <ul className="space-y-2 text-sm">
          {Object.entries(objections).map(([key, value]) => (
            <li key={key}>
              <strong>{key}:</strong> {value}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
