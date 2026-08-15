/**
 * Walk every stale Apple-billed subscription. Offset pagination would skip rows
 * because a successful reconcile updates `updated_at` and drops it from the
 * stale set — so each page re-reads the current stale head.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppleIapConfig } from "@/lib/iap/apple/config";
import { fetchAppleSubscriptionStatuses } from "@/lib/iap/apple/app-store-api";
import {
  handleAppleSubscriptionExpired,
  processAppleSignedTransaction,
} from "@/lib/iap/apple/entitlement-bridge";
import { parseAppleTransactionJws } from "@/lib/iap/apple/jws";

export const APPLE_RECONCILE_PAGE_SIZE = 50;
export const APPLE_RECONCILE_MAX_PER_RUN = 400;
export const APPLE_RECONCILE_STALE_MS = 6 * 60 * 60 * 1000;

export type AppleReconcileResult = {
  checked: number;
  reconciled: number;
  expired: number;
  errors: number;
  hasMore: boolean;
};

type StaleSub = {
  provider_id: string;
  apple_original_transaction_id?: string | null;
  apple_environment?: "Production" | "Sandbox" | string | null;
};

async function fetchStalePage(
  supabase: SupabaseClient,
  staleBefore: string,
  pageSize: number,
): Promise<StaleSub[]> {
  const { data } = await supabase
    .from("provider_subscriptions")
    .select("provider_id, apple_original_transaction_id, apple_environment, updated_at, status")
    .eq("billing_provider", "apple")
    .not("apple_original_transaction_id", "is", null)
    .lt("updated_at", staleBefore)
    .order("updated_at", { ascending: true })
    .limit(pageSize);
  return (data ?? []) as StaleSub[];
}

export async function reconcileStaleAppleSubscriptions(params: {
  supabase: SupabaseClient;
  config: AppleIapConfig;
  pageSize?: number;
  maxPerRun?: number;
  staleMs?: number;
  now?: Date;
}): Promise<AppleReconcileResult> {
  const pageSize = params.pageSize ?? APPLE_RECONCILE_PAGE_SIZE;
  const maxPerRun = params.maxPerRun ?? APPLE_RECONCILE_MAX_PER_RUN;
  const staleMs = params.staleMs ?? APPLE_RECONCILE_STALE_MS;
  const staleBefore = new Date((params.now ?? new Date()).getTime() - staleMs).toISOString();

  let checked = 0;
  let reconciled = 0;
  let expired = 0;
  let errors = 0;
  let hasMore = false;

  while (checked < maxPerRun) {
    const remaining = maxPerRun - checked;
    const take = Math.min(pageSize, remaining);
    const page = await fetchStalePage(params.supabase, staleBefore, take);
    if (page.length === 0) break;

    for (const row of page) {
      const otid = row.apple_original_transaction_id?.trim();
      checked += 1;
      if (!otid) {
        await params.supabase
          .from("provider_subscriptions")
          .update({ updated_at: new Date().toISOString() })
          .eq("provider_id", row.provider_id);
        continue;
      }
      try {
        const statusPayload = await fetchAppleSubscriptionStatuses(
          params.config,
          otid,
          row.apple_environment === "Sandbox" ? "Sandbox" : "Production",
        );
        const data = statusPayload as {
          data?: Array<{
            lastTransactions?: Array<{ status?: number; signedTransactionInfo?: string }>;
          }>;
        };

        let newest: { signed: string; expiresDate: number } | null = null;
        for (const entry of data.data ?? []) {
          for (const last of entry.lastTransactions ?? []) {
            const signed = last.signedTransactionInfo;
            if (!signed) continue;
            let expiresDate = 0;
            try {
              expiresDate = parseAppleTransactionJws(signed).expiresDate ?? 0;
            } catch {
              continue;
            }
            if (!newest || expiresDate > newest.expiresDate) {
              newest = { signed, expiresDate };
            }
          }
        }

        if (!newest) {
          await params.supabase
            .from("provider_subscriptions")
            .update({ updated_at: new Date().toISOString() })
            .eq("provider_id", row.provider_id);
          continue;
        }

        const result = await processAppleSignedTransaction({
          supabase: params.supabase,
          signedTransaction: newest.signed,
          providerIdHint: row.provider_id,
        });
        if (result.ok) reconciled += 1;

        if (newest.expiresDate > 0 && newest.expiresDate < Date.now()) {
          await handleAppleSubscriptionExpired(params.supabase, otid);
          expired += 1;
        }
      } catch (e) {
        errors += 1;
        console.warn("[cron/reconcile-apple-subscriptions]", otid, e);
        await params.supabase
          .from("provider_subscriptions")
          .update({ updated_at: new Date().toISOString() })
          .eq("provider_id", row.provider_id);
      }
    }

    if (page.length < take) {
      hasMore = false;
      break;
    }
    if (checked >= maxPerRun) {
      hasMore = true;
      break;
    }
  }

  return { checked, reconciled, expired, errors, hasMore };
}
