import { useQuery } from "@tanstack/react-query";
import { callsApi, dashboardApi } from "../api";
import { contactDisplayName } from "../types";

export function DashboardPage() {
  const { data: summary } = useQuery({ queryKey: ["dashboard"], queryFn: dashboardApi.summary });
  const { data: activeCall } = useQuery({
    queryKey: ["activeCall"],
    queryFn: callsApi.active,
    refetchInterval: 3000,
  });

  const cards = [
    { label: "סה״כ אנשי קשר", value: summary?.total ?? 0 },
    { label: "ממתינים לשיחה", value: summary?.pending ?? 0 },
    { label: "נמכרו היום", value: summary?.soldToday ?? 0 },
    { label: "סירבו", value: summary?.refused ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">לוח בקרה</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-3xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>
      {summary?.activeCall || activeCall ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="font-semibold text-blue-800">שיחה פעילה</p>
          <p className="text-sm text-blue-700">
            {activeCall?.contact
              ? contactDisplayName(activeCall.contact)
              : "מתבצעת שיחה כעת..."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
