import type { SupabaseClient } from "@supabase/supabase-js";
import { getYocoEndpoints } from "@/lib/payments/yoco";
import {
  getValidAccessToken,
  resolveProviderCredentialMode,
  YocoOAuthRequired,
} from "@/lib/payments/yoco-oauth";

/**
 * Pull the latest Web POS status from Yoco and persist it. Virtual checkout rows are
 * webhook-driven and returned unchanged. Best-effort: on any failure the local status wins.
 */
export async function syncYocoPaymentStatusFromGateway(
  admin: SupabaseClient,
  providerId: string,
  row: {
    id: string;
    status?: string | null;
    yoco_device_id?: string | null;
    yoco_payment_id?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<string> {
  const local = String(row.status ?? "pending");
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const isVirtual =
    meta.credential_mode === "virtual_checkout" ||
    (typeof row.yoco_device_id === "string" && row.yoco_device_id.startsWith("virtual:"));
  if (isVirtual || !row.yoco_device_id || !row.yoco_payment_id) return local;

  try {
    const credentials = await resolveProviderCredentialMode(providerId);
    if (credentials.credentialMode !== "oauth") return local;
    const endpoints = getYocoEndpoints(credentials.environment);
    const accessToken = await getValidAccessToken(providerId, {
      environment: credentials.environment,
    });
    const res = await fetch(endpoints.getWebPosPayment(row.yoco_device_id, row.yoco_payment_id), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return local;
    const remote = (await res.json()) as { status?: string };
    if (remote.status && remote.status !== local) {
      await admin
        .from("provider_yoco_payments")
        .update({ status: remote.status, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("provider_id", providerId);
      return remote.status;
    }
  } catch (err) {
    if (!(err instanceof YocoOAuthRequired)) {
      console.error("syncYocoPaymentStatusFromGateway:", err);
    }
  }
  return local;
}
