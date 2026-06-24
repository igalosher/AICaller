import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "../api";

function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function OpenAiBalanceBadge() {
  const { data, isLoading } = useQuery({
    queryKey: ["openaiBalance"],
    queryFn: settingsApi.openAiBalance,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading && !data) {
    return (
      <span className="text-xs text-slate-400" aria-live="polite">
        OpenAI…
      </span>
    );
  }

  if (!data?.configured) {
    return (
      <a
        href="https://platform.openai.com/settings/organization/billing/overview"
        target="_blank"
        rel="noreferrer"
        className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 hover:bg-amber-100"
        title="הגדר מפתח OpenAI בהגדרות"
      >
        OpenAI לא מוגדר
      </a>
    );
  }

  if (data.available && data.balanceUsd !== null) {
    return (
      <a
        href={data.dashboardUrl}
        target="_blank"
        rel="noreferrer"
        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
        title={
          data.totalUsedUsd !== null && data.totalGrantedUsd !== null
            ? `שומש: ${formatUsd(data.totalUsedUsd)} מתוך ${formatUsd(data.totalGrantedUsd)}`
            : "פתח לוח חיוב OpenAI"
        }
      >
        OpenAI {formatUsd(data.balanceUsd)}
      </a>
    );
  }

  return (
    <a
      href={data.dashboardUrl}
      target="_blank"
      rel="noreferrer"
      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
      title="OpenAI לא מאפשר יתרה דרך API — לחץ ללוח החיוב"
    >
      OpenAI · יתרה בלוח
    </a>
  );
}
