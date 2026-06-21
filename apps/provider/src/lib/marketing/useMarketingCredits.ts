/**
 * Marketing credit state + top-up flow for the provider mobile app.
 *
 * Mirrors the web provider portal so providers on Beautonomi platform sending
 * can see their prepaid marketing balance, understand spend, and top up via
 * Paystack without leaving the app. When a provider sends through their own
 * integrations (SendGrid/Twilio), the platform does not charge credits, so the
 * UI surfaces that mode instead of a balance.
 */
import { useCallback, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useInAppPaystackCheckout } from "@/hooks/useInAppPaystackCheckout";
import { getProviderPaystackReturnBaseUrl } from "@/lib/payments/providerPaystackReturn";

export interface MarketingBalance {
  included_balance_zar: number;
  purchased_balance_zar: number;
  total_zar: number;
}

export interface MarketingStatus {
  use_platform_credentials: boolean;
  custom_integrations?: boolean;
  marketing_enabled: boolean;
  channels: string[];
  balance: MarketingBalance;
  has_own_twilio?: boolean;
  has_own_email?: boolean;
  sending_mode: string;
  platform_available: boolean;
  /** Channels where platform sending debits prepaid credits. */
  credits_apply_on: string[];
}

export interface MarketingLedgerSummary {
  period_start: string;
  topped_up: number;
  granted: number;
  admin_adjustments: number;
  spent: number;
  refunded: number;
  spent_by_channel: Record<string, number>;
}

export interface MarketingLedgerResponse {
  balance: MarketingBalance;
  summary: MarketingLedgerSummary;
  ledger: unknown[];
}

export type TopUpResult = { ok: true } | { ok: false; message?: string; cancelled?: boolean };

const STATUS_URL = "/api/provider/marketing/status";
const LEDGER_URL = "/api/provider/marketing/credits/ledger";
const TOPUP_URL = "/api/provider/marketing/credits/topup";
/** Static HTTPS success landing Paystack redirects to (webhook is source of truth). */
const TOPUP_RETURN_PATH = "/provider/settings/marketing-integrations";

/** Webhook can lag the redirect; poll the balance briefly so the UI reflects the new credit. */
async function pollBalanceIncrease(
  before: number,
  attempts = 8,
  delayMs = 1500,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    const res = await api.get<MarketingStatus>(STATUS_URL);
    const total = res.data?.balance?.total_zar;
    if (typeof total === "number" && total > before + 0.0001) return true;
  }
  return false;
}

export interface UseMarketingCreditsResult {
  status: MarketingStatus | null;
  ledger: MarketingLedgerResponse | null;
  loading: boolean;
  /** Provider sends via platform on at least one channel, so credits are charged. */
  creditsApply: boolean;
  toppingUp: boolean;
  refresh: () => Promise<void>;
  topUp: (amountZar: number) => Promise<TopUpResult>;
}

export function useMarketingCredits(): UseMarketingCreditsResult {
  const statusApi = useApi<MarketingStatus>(STATUS_URL, { staleTimeMs: 30_000 });
  const ledgerApi = useApi<MarketingLedgerResponse>(LEDGER_URL, { staleTimeMs: 30_000 });
  const { waitForCheckout } = useInAppPaystackCheckout();
  const [toppingUp, setToppingUp] = useState(false);

  const refresh = useCallback(async () => {
    await Promise.all([statusApi.refresh(), ledgerApi.refresh()]);
  }, [statusApi, ledgerApi]);

  const topUp = useCallback(
    async (amountZar: number): Promise<TopUpResult> => {
      if (!Number.isFinite(amountZar) || amountZar < 10) {
        return { ok: false, message: "Minimum top-up is R10." };
      }
      setToppingUp(true);
      const balanceBefore = statusApi.data?.balance?.total_zar ?? 0;
      try {
        const res = await api.post<{ payment_url?: string; paystack_reference?: string; amount_zar?: number }>(
          TOPUP_URL,
          { amount_zar: Math.round(amountZar * 100) / 100 },
        );
        if (res.error || !res.data?.payment_url) {
          return { ok: false, message: getApiErrorMessage(res.error, "Could not start top-up.") };
        }
        const returnUrl = `${getProviderPaystackReturnBaseUrl()}${TOPUP_RETURN_PATH}`;
        const outcome = await waitForCheckout(res.data.payment_url, {
          title: "Top up marketing credits",
          returnUrl,
          matchSuccess: (u) => u.includes("topup=success") || u.includes("payment_success"),
          matchCancel: (u) => u.includes("cancelled=1") || u.includes("payment_cancelled=1"),
        });
        if (outcome.outcome === "success") {
          await pollBalanceIncrease(balanceBefore);
          await refresh();
          return { ok: true };
        }
        if (outcome.outcome === "cancel") {
          return { ok: false, cancelled: true, message: "Top-up cancelled." };
        }
        // Browser closed before we could confirm — webhook may still land, so refresh.
        await refresh();
        return { ok: false, message: "Top-up wasn't completed. If you were charged, your balance will update shortly." };
      } catch (e) {
        return { ok: false, message: getApiErrorMessage(e, "Could not complete top-up.") };
      } finally {
        setToppingUp(false);
      }
    },
    [statusApi.data, waitForCheckout, refresh],
  );

  return {
    status: statusApi.data ?? null,
    ledger: ledgerApi.data ?? null,
    loading: statusApi.loading || ledgerApi.loading,
    creditsApply: (statusApi.data?.credits_apply_on?.length ?? 0) > 0,
    toppingUp,
    refresh,
    topUp,
  };
}
