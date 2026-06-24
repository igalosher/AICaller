import { logger } from "../logger.js";
import { getAiConfig } from "./settingsService.js";

export type OpenAiBalanceStatus = {
  configured: boolean;
  balanceUsd: number | null;
  totalGrantedUsd: number | null;
  totalUsedUsd: number | null;
  currency: string;
  available: boolean;
  messageHe: string;
  dashboardUrl: string;
  fetchedAt: string;
};

const BILLING_DASHBOARD_URL = "https://platform.openai.com/settings/organization/billing/overview";

type CreditGrantsResponse = {
  total_granted?: number;
  total_used?: number;
  total_available?: number;
  grants?: { data?: { grant_amount?: number; used_amount?: number }[] };
};

function sumGrants(data: CreditGrantsResponse): {
  granted: number | null;
  used: number | null;
  available: number | null;
} {
  if (typeof data.total_available === "number") {
    return {
      granted: typeof data.total_granted === "number" ? data.total_granted : null,
      used: typeof data.total_used === "number" ? data.total_used : null,
      available: data.total_available,
    };
  }
  const grants = data.grants?.data ?? [];
  if (grants.length === 0) return { granted: null, used: null, available: null };
  let granted = 0;
  let used = 0;
  for (const g of grants) {
    granted += g.grant_amount ?? 0;
    used += g.used_amount ?? 0;
  }
  return { granted, used, available: Math.max(0, granted - used) };
}

export async function getOpenAiBalanceStatus(): Promise<OpenAiBalanceStatus> {
  const base: OpenAiBalanceStatus = {
    configured: false,
    balanceUsd: null,
    totalGrantedUsd: null,
    totalUsedUsd: null,
    currency: "usd",
    available: false,
    messageHe: "OpenAI לא מוגדר",
    dashboardUrl: BILLING_DASHBOARD_URL,
    fetchedAt: new Date().toISOString(),
  };

  const config = await getAiConfig();
  if (!config.openaiApiKey) return base;

  base.configured = true;
  base.messageHe = "יתרה לא זמינה — צפה בלוח OpenAI";

  try {
    const res = await fetch("https://api.openai.com/v1/dashboard/billing/credit_grants", {
      headers: { Authorization: `Bearer ${config.openaiApiKey}` },
    });
    if (!res.ok) {
      const body = await res.text();
      logger.debug(
        { status: res.status, body: body.slice(0, 200) },
        "OpenAI credit_grants unavailable",
      );
      return base;
    }
    const data = (await res.json()) as CreditGrantsResponse;
    const { granted, used, available } = sumGrants(data);
    if (available === null) return base;

    base.balanceUsd = available;
    base.totalGrantedUsd = granted;
    base.totalUsedUsd = used;
    base.available = true;
    base.messageHe = `$${available.toFixed(2)} נותרו ב-OpenAI`;
    return base;
  } catch (err) {
    logger.debug({ err }, "OpenAI balance fetch failed");
    return base;
  }
}
