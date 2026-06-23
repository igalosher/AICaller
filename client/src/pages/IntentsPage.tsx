import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { intentsApi } from "../api";
import type { Intent } from "../types";

export function IntentsPage() {
  const qc = useQueryClient();
  const { data: intents } = useQuery({ queryKey: ["intents"], queryFn: intentsApi.list });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newPhrase, setNewPhrase] = useState("");
  const [threshold, setThreshold] = useState(0.7);

  const selected = intents?.find((i) => i.id === selectedId);

  const addExampleMutation = useMutation({
    mutationFn: () => intentsApi.addExample(selectedId!, newPhrase),
    onSuccess: () => {
      setNewPhrase("");
      qc.invalidateQueries({ queryKey: ["intents"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      intentsApi.update(selectedId!, { confidenceThreshold: threshold }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intents"] }),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">ניהול כוונות</h2>
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-right">כוונה</th>
                <th className="px-4 py-3 text-right">קטגוריה</th>
                <th className="px-4 py-3 text-right">דוגמאות</th>
                <th className="px-4 py-3 text-right">שימושים</th>
              </tr>
            </thead>
            <tbody>
              {intents?.map((intent: Intent) => (
                <tr
                  key={intent.id}
                  className={`cursor-pointer border-t ${selectedId === intent.id ? "bg-blue-50" : ""}`}
                  onClick={() => {
                    setSelectedId(intent.id);
                    setThreshold(intent.confidenceThreshold);
                  }}
                >
                  <td className="px-4 py-3">{intent.labelHe}</td>
                  <td className="px-4 py-3">{intent.category}</td>
                  <td className="px-4 py-3">{intent.examples?.length ?? 0}</td>
                  <td className="px-4 py-3">{intent.usageCount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        {!selected && <p className="text-sm text-slate-500">בחר כוונה לעריכה</p>}
        {selected && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">{selected.labelHe}</h3>
            <p className="text-sm text-slate-600">{selected.descriptionHe || selected.id}</p>

            <div>
              <label className="mb-1 block text-sm font-medium">
                סף ביטחון ({threshold.toFixed(2)})
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full"
              />
              <button
                className="mt-2 rounded bg-blue-600 px-3 py-1 text-sm text-white"
                onClick={() => updateMutation.mutate()}
              >
                שמור סף
              </button>
            </div>

            <div>
              <h4 className="mb-2 font-medium">ביטויים לדוגמה</h4>
              <ul className="mb-3 space-y-1 text-sm">
                {selected.examples?.map((ex) => (
                  <li key={ex.id} className="rounded bg-slate-50 px-2 py-1">
                    {ex.phrase}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded border px-2 py-1 text-sm"
                  value={newPhrase}
                  onChange={(e) => setNewPhrase(e.target.value)}
                  placeholder="הוסף ביטוי בעברית"
                />
                <button
                  className="rounded border px-3 py-1 text-sm"
                  disabled={!newPhrase}
                  onClick={() => addExampleMutation.mutate()}
                >
                  הוסף
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
