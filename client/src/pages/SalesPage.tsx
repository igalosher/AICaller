import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAxiosError } from "axios";
import { salesApi } from "../api";

function getErrorMessage(err: unknown): string {
  if (isAxiosError(err) && err.response?.data?.error) {
    return String(err.response.data.error);
  }
  return "שגיאה בייבוא הקטלוג";
}

export function SalesPage() {
  const qc = useQueryClient();
  const [jsonText, setJsonText] = useState("");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const { data: catalog } = useQuery({
    queryKey: ["yesCatalog"],
    queryFn: salesApi.getCatalog,
  });
  const { data: packets } = useQuery({ queryKey: ["packets"], queryFn: salesApi.packets });
  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: salesApi.channels });
  const { data: tiers } = useQuery({ queryKey: ["tiers"], queryFn: salesApi.internetTiers });

  const importMutation = useMutation({
    mutationFn: (catalog: unknown) => salesApi.importCatalog(catalog),
    onSuccess: (data) => {
      setImportError(null);
      setImportMessage(
        `יובא בהצלחה: ${data.summary.salesPackets} חבילות, ${data.summary.channelPackages} חבילות ערוצים, ${data.summary.internetTiers} מהירויות אינטרנט`,
      );
      setJsonText("");
      qc.invalidateQueries({ queryKey: ["yesCatalog"] });
      qc.invalidateQueries({ queryKey: ["packets"] });
      qc.invalidateQueries({ queryKey: ["channels"] });
      qc.invalidateQueries({ queryKey: ["tiers"] });
    },
    onError: (err) => {
      setImportMessage(null);
      setImportError(getErrorMessage(err));
    },
  });

  const loadDefaultMutation = useMutation({
    mutationFn: salesApi.loadDefaultCatalog,
    onSuccess: (data) => {
      setImportError(null);
      setImportMessage(
        `נטען קטלוג ברירת מחדל: ${data.summary.salesPackets} חבילות, ${data.summary.channelPackages} ערוצים, ${data.summary.internetTiers} אינטרנט`,
      );
      qc.invalidateQueries();
    },
    onError: (err) => setImportError(getErrorMessage(err)),
  });

  function handleImport() {
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      importMutation.mutate(parsed);
    } catch {
      setImportError("JSON לא תקין — בדוק את הפורמט");
    }
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">הגדרות מכירה</h2>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-lg font-semibold">ייבוא קטלוג YES (JSON)</h3>
        <p className="mb-3 text-sm text-slate-600">
          הדבק JSON מעודכן מהאתר כדי לדרוס את כל החבילות, הערוצים ומחירי האינטרנט.
          {catalog?.importedAt && (
            <span className="mt-1 block text-slate-500">
              ייבוא אחרון: {new Date(catalog.importedAt).toLocaleString("he-IL")}
              {catalog.scannedAt ? ` · סריקה: ${catalog.scannedAt}` : ""}
            </span>
          )}
        </p>
        <textarea
          className="mb-3 h-40 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
          dir="ltr"
          placeholder='הדבק כאן JSON מלא של קטלוג yes...'
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
            disabled={!jsonText.trim() || importMutation.isPending}
            onClick={handleImport}
          >
            {importMutation.isPending ? "מייבא..." : "ייבוא ודריסת קטלוג"}
          </button>
          <button
            className="rounded-lg border border-slate-300 px-4 py-2"
            disabled={loadDefaultMutation.isPending}
            onClick={() => loadDefaultMutation.mutate()}
          >
            טען קטלוג ברירת מחדל
          </button>
        </div>
        {importMessage && (
          <p className="mt-3 text-sm text-green-700">{importMessage}</p>
        )}
        {importError && <p className="mt-3 text-sm text-red-700">{importError}</p>}
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold">חבילות מכירה ({packets?.length ?? 0})</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {packets?.map((p) => (
            <div key={p.id} className="rounded-xl border bg-white p-4">
              <div className="flex justify-between">
                <h4 className="font-bold">{p.nameHe}</h4>
                <span className={p.active ? "text-green-600" : "text-slate-400"}>
                  {p.active ? "פעיל" : "לא פעיל"}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{p.descriptionHe}</p>
              <p className="mt-2 font-semibold">₪{p.priceMonthly}/חודש</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold">חבילות ערוצים ({channels?.length ?? 0})</h3>
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {channels?.map((c: { id: string; nameHe: string; channels: string; priceAddon?: number }) => (
            <li key={c.id} className="rounded-lg border bg-white px-4 py-3 text-sm">
              <div className="font-medium">
                {c.nameHe}
                {c.priceAddon ? ` · ₪${c.priceAddon}/חודש` : ""}
              </div>
              <div className="mt-1 text-slate-600">
                {JSON.parse(c.channels).slice(0, 8).join(", ")}
                {JSON.parse(c.channels).length > 8 ? "..." : ""}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold">מהירויות אינטרנט ({tiers?.length ?? 0})</h3>
        <ul className="space-y-2">
          {tiers?.map((t: { id: string; nameHe: string; downloadMbps: number; uploadMbps: number; priceMonthly: number }) => (
            <li key={t.id} className="rounded-lg border bg-white px-4 py-3">
              {t.nameHe} — {t.downloadMbps}/{t.uploadMbps} Mbps · ₪{t.priceMonthly}/חודש
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
