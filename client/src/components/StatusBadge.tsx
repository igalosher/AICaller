const labels: Record<string, string> = {
  pending: "ממתין",
  in_call: "בשיחה",
  sold: "נמכר",
  callback: "לחזור",
  refused: "סירב",
  blacklisted: "הוסר",
  dialing: "מחייג",
  ringing: "מצלצל",
  connected: "מחובר",
  ended: "הסתיים",
  failed: "נכשל",
  no_answer: "לא ענה",
  busy: "תפוס",
  none: "ללא",
};

const colors: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  in_call: "bg-blue-100 text-blue-700",
  sold: "bg-green-100 text-green-700",
  callback: "bg-amber-100 text-amber-800",
  refused: "bg-red-100 text-red-700",
  blacklisted: "bg-neutral-200 text-neutral-800",
  connected: "bg-blue-100 text-blue-700",
  ended: "bg-slate-100 text-slate-600",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] ?? "bg-slate-100"}`}>
      {labels[status] ?? status}
    </span>
  );
}
