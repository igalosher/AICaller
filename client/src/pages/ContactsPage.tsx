import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { callsApi, contactsApi } from "../api";
import { StatusBadge } from "../components/StatusBadge";

type ContactForm = {
  id?: string;
  firstName: string;
  familyName: string;
  phone: string;
  notes: string;
};

function getErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err) && err.response?.data?.error) {
    return String(err.response.data.error);
  }
  return fallback;
}

const emptyForm: ContactForm = { firstName: "", familyName: "", phone: "", notes: "" };

export function ContactsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ContactForm | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [callingId, setCallingId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["contacts", search, status],
    queryFn: () => contactsApi.list({ search: search || undefined, status: status || undefined }),
  });

  const saveMutation = useMutation({
    mutationFn: (form: ContactForm) => {
      const payload = {
        firstName: form.firstName.trim(),
        familyName: form.familyName.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim() || undefined,
      };
      if (form.id) {
        return contactsApi.update(form.id, payload);
      }
      return contactsApi.create(payload);
    },
    onMutate: () => setSaveError(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setModalOpen(false);
      setEditing(null);
    },
    onError: (err) => setSaveError(getErrorMessage(err, "שגיאה בשמירת איש קשר")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contactsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setDeleteId(null);
    },
  });

  const callMutation = useMutation({
    mutationFn: (contactId: string) => callsApi.start(contactId),
    onMutate: (contactId) => {
      setCallError(null);
      setCallingId(contactId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["calls"] });
      qc.invalidateQueries({ queryKey: ["activeCall"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setCallingId(null);
      navigate("/calls");
    },
    onError: (err) => {
      setCallError(getErrorMessage(err, "שגיאה בהפעלת השיחה"));
      setCallingId(null);
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  function handleSave() {
    if (!editing) return;
    if (!editing.firstName.trim()) {
      setSaveError("נא למלא שם פרטי");
      return;
    }
    if (!editing.phone.trim()) {
      setSaveError("נא למלא מספר טלפון");
      return;
    }
    saveMutation.mutate(editing);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">אנשי קשר</h2>
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-4 py-2 text-white"
          onClick={() => {
            setEditing(emptyForm);
            setSaveError(null);
            setModalOpen(true);
          }}
        >
          הוסף איש קשר
        </button>
      </div>

      {callError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {callError}
        </div>
      )}

      <div className="flex gap-3">
        <input
          className="rounded-lg border border-slate-300 px-3 py-2"
          placeholder="חיפוש לפי שם או טלפון"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded-lg border border-slate-300 px-3 py-2"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">כל הסטטוסים</option>
          <option value="pending">ממתין</option>
          <option value="sold">נמכר</option>
          <option value="callback">לחזור</option>
          <option value="refused">סירב</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-right">שם פרטי</th>
              <th className="px-4 py-3 text-right">שם משפחה</th>
              <th className="px-4 py-3 text-right">טלפון</th>
              <th className="px-4 py-3 text-right">סטטוס</th>
              <th className="px-4 py-3 text-right">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{c.firstName}</td>
                <td className="px-4 py-3">{c.familyName || "—"}</td>
                <td className="px-4 py-3">{c.phone}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-blue-600 disabled:text-slate-400"
                      disabled={c.status === "refused" || callingId === c.id}
                      onClick={() => callMutation.mutate(c.id)}
                    >
                      {callingId === c.id ? "מחייג..." : "התקשר"}
                    </button>
                    <button
                      type="button"
                      className="text-slate-600"
                      onClick={() => {
                        setEditing({
                          id: c.id,
                          firstName: c.firstName,
                          familyName: c.familyName ?? "",
                          phone: c.phone,
                          notes: c.notes ?? "",
                        });
                        setSaveError(null);
                        setModalOpen(true);
                      }}
                    >
                      ערוך
                    </button>
                    <button type="button" className="text-red-600" onClick={() => setDeleteId(c.id)}>
                      מחק
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && editing && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <h3 className="mb-4 text-lg font-bold">{editing.id ? "עריכת איש קשר" : "איש קשר חדש"}</h3>
            {saveError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {saveError}
              </div>
            )}
            <div className="space-y-3">
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="שם פרטי"
                value={editing.firstName}
                onChange={(e) => setEditing({ ...editing, firstName: e.target.value })}
              />
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="שם משפחה"
                value={editing.familyName}
                onChange={(e) => setEditing({ ...editing, familyName: e.target.value })}
              />
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="טלפון (05X...)"
                value={editing.phone}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              />
              <textarea
                className="w-full rounded-lg border px-3 py-2"
                placeholder="הערות"
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-4 py-2" onClick={() => setModalOpen(false)}>
                ביטול
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
                disabled={saveMutation.isPending}
                onClick={handleSave}
              >
                {saveMutation.isPending ? "שומר..." : "שמור"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="rounded-xl bg-white p-6">
            <p className="mb-4">האם למחוק את איש הקשר?</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteId(null)}>
                ביטול
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-white"
                onClick={() => deleteMutation.mutate(deleteId)}
              >
                מחק
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
