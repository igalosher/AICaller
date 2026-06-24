import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useState, type FormEvent } from "react";
import { intentsApi } from "../api";
import type { Intent } from "../types";

function getErrorMessage(err: unknown): string {
  if (isAxiosError(err) && err.response?.data?.error) {
    return String(err.response.data.error);
  }
  return "שגיאה בשמירה";
}

const EMPTY_CREATE = {
  id: "",
  labelHe: "",
  category: "custom",
  descriptionHe: "",
};

export function IntentsPage() {
  const qc = useQueryClient();
  const { data: intents } = useQuery({ queryKey: ["intents"], queryFn: intentsApi.list });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newPhrase, setNewPhrase] = useState("");
  const [threshold, setThreshold] = useState(0.7);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [createError, setCreateError] = useState<string | null>(null);

  const selected = intents?.find((i) => i.id === selectedId);

  const createMutation = useMutation({
    mutationFn: () =>
      intentsApi.create({
        id: createForm.id.trim(),
        labelHe: createForm.labelHe.trim(),
        category: createForm.category.trim() || "custom",
        descriptionHe: createForm.descriptionHe.trim() || undefined,
      }),
    onSuccess: (intent) => {
      setCreateForm(EMPTY_CREATE);
      setShowCreate(false);
      setCreateError(null);
      setSelectedId(intent.id);
      setThreshold(intent.confidenceThreshold ?? 0.7);
      qc.invalidateQueries({ queryKey: ["intents"] });
    },
    onError: (err) => setCreateError(getErrorMessage(err)),
  });

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

  const onCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!createForm.id.trim() || !createForm.labelHe.trim()) {
      setCreateError("מזהה ושם בעברית הם שדות חובה");
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(createForm.id.trim())) {
      setCreateError("מזהה באנגלית בלבד: אותיות קטנות, מספרים וקו תחתון (למשל ask_wifi)");
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-bold">ניהול כוונות</h2>
          <button
            type="button"
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            onClick={() => {
              setShowCreate((v) => !v);
              setCreateError(null);
            }}
          >
            {showCreate ? "ביטול" : "כוונה חדשה"}
          </button>
        </div>

        {showCreate && (
          <form
            className="space-y-3 rounded-xl border bg-white p-4"
            onSubmit={onCreateSubmit}
          >
            <h3 className="font-semibold">יצירת כוונה</h3>
            <div>
              <label className="mb-1 block text-sm font-medium">מזהה (אנגלית)</label>
              <input
                className="w-full rounded border px-2 py-1 text-sm"
                dir="ltr"
                value={createForm.id}
                onChange={(e) => setCreateForm((f) => ({ ...f, id: e.target.value }))}
                placeholder="ask_wifi"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">שם בעברית</label>
              <input
                className="w-full rounded border px-2 py-1 text-sm"
                value={createForm.labelHe}
                onChange={(e) => setCreateForm((f) => ({ ...f, labelHe: e.target.value }))}
                placeholder="שאלה על WiFi"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">קטגוריה</label>
              <input
                className="w-full rounded border px-2 py-1 text-sm"
                value={createForm.category}
                onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="product"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">תיאור (אופציונלי)</label>
              <input
                className="w-full rounded border px-2 py-1 text-sm"
                value={createForm.descriptionHe}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, descriptionHe: e.target.value }))
                }
              />
            </div>
            {createError && <p className="text-sm text-red-600">{createError}</p>}
            <button
              type="submit"
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "שומר..." : "צור כוונה"}
            </button>
          </form>
        )}

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
