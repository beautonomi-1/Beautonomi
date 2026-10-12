import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { fromMinorUnits, toMinorUnits } from "@beautonomi/utils";

const FLW_API = "https://api.flutterwave.com/v3";

function normalizeTenantId(tenantId?: string | null): string | null {
  if (typeof tenantId !== "string") return null;
  const trimmed = tenantId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getFlutterwaveSecretKey(options?: {
  tenantId?: string | null;
}): Promise<string> {
  const tenantId = normalizeTenantId(options?.tenantId);
  const supabase = getSupabaseAdmin();

  if (tenantId) {
    const regionConfig = await getTenantRegionConfig(tenantId);
    if (regionConfig?.regionId) {
      const { data } = await supabase
        .from("region_secrets")
        .select("value_encrypted")
        .eq("region_id", regionConfig.regionId)
        .eq("key", "flutterwave_secret_key")
        .maybeSingle();
      const regionKey = (data as { value_encrypted?: string } | null)?.value_encrypted;
      if (regionKey?.trim()) return regionKey.trim();
    }
  }

  const envKey = process.env.FLUTTERWAVE_SECRET_KEY?.trim();
  if (envKey) return envKey;

  throw new Error(
    "Flutterwave secret key not configured: set FLUTTERWAVE_SECRET_KEY or store flutterwave_secret_key in region_secrets",
  );
}

export async function getFlutterwaveWebhookHash(options?: {
  tenantId?: string | null;
}): Promise<string | null> {
  const tenantId = normalizeTenantId(options?.tenantId);
  const supabase = getSupabaseAdmin();

  if (tenantId) {
    const regionConfig = await getTenantRegionConfig(tenantId);
    if (regionConfig?.regionId) {
      const { data } = await supabase
        .from("region_secrets")
        .select("value_encrypted")
        .eq("region_id", regionConfig.regionId)
        .eq("key", "flutterwave_webhook_hash")
        .maybeSingle();
      const regionHash = (data as { value_encrypted?: string } | null)?.value_encrypted;
      if (regionHash?.trim()) return regionHash.trim();
    }
  }

  const envHash =
    process.env.FLUTTERWAVE_WEBHOOK_SECRET?.trim() ||
    process.env.FLUTTERWAVE_WEBHOOK_HASH?.trim();
  return envHash || null;
}

export function verifyFlutterwaveWebhookHash(
  header: string | null,
  secret: string,
): boolean {
  if (!header || !secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

type FlutterwaveApiResponse<T> = {
  status?: string;
  message?: string;
  data?: T;
};

export async function flutterwaveRequest<T>(
  method: "GET" | "POST",
  path: string,
  body: Record<string, unknown> | null,
  tenantId?: string | null,
): Promise<FlutterwaveApiResponse<T>> {
  const secret = await getFlutterwaveSecretKey({ tenantId });
  const url = path.startsWith("http") ? path : `${FLW_API}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as FlutterwaveApiResponse<T>;
  if (!res.ok || json.status !== "success") {
    const msg = json.message || `Flutterwave API ${method} ${path} failed`;
    throw new Error(msg);
  }
  return json;
}

export type FlutterwaveVerifiedTransaction = {
  id: string;
  tx_ref: string;
  status: string;
  amount: number;
  currency: string;
  app_fee?: number;
  customer?: { email?: string };
  card?: { token?: string; last_4digits?: string; expiry?: string; type?: string };
  meta?: Record<string, unknown>;
};

function parseVerifiedData(raw: Record<string, unknown>): FlutterwaveVerifiedTransaction {
  const id = String(raw.id ?? "");
  const txRef = String(raw.tx_ref ?? raw.txRef ?? "");
  const status = String(raw.status ?? "").toLowerCase();
  const amount = Number(raw.amount ?? 0);
  const currency = String(raw.currency ?? "ZAR").toUpperCase();
  const appFee = raw.app_fee != null ? Number(raw.app_fee) : undefined;
  const customer =
    raw.customer && typeof raw.customer === "object"
      ? (raw.customer as { email?: string })
      : undefined;
  const card =
    raw.card && typeof raw.card === "object"
      ? (raw.card as FlutterwaveVerifiedTransaction["card"])
      : undefined;
  let meta: Record<string, unknown> | undefined;
  if (raw.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta)) {
    meta = raw.meta as Record<string, unknown>;
  }
  return { id, tx_ref: txRef, status, amount, currency, app_fee: appFee, customer, card, meta };
}

export async function verifyFlutterwaveTransactionById(
  transactionId: string,
  options?: {
    tenantId?: string | null;
    expectedTxRef?: string;
    expectedAmountMinor?: number;
    currency?: string;
  },
): Promise<{ ok: true; tx: FlutterwaveVerifiedTransaction } | { ok: false; reason: string }> {
  const id = transactionId.trim();
  if (!id) return { ok: false, reason: "missing_transaction_id" };

  const json = await flutterwaveRequest<Record<string, unknown>>(
    "GET",
    `/transactions/${encodeURIComponent(id)}/verify`,
    null,
    options?.tenantId,
  );
  const tx = parseVerifiedData(json.data ?? {});

  if (tx.status !== "successful") {
    return { ok: false, reason: `status_${tx.status || "unknown"}` };
  }

  const expectedRef = options?.expectedTxRef?.trim();
  if (expectedRef && tx.tx_ref !== expectedRef) {
    return { ok: false, reason: "tx_ref_mismatch" };
  }

  const currency = (options?.currency || tx.currency).toUpperCase();
  if (options?.currency && tx.currency !== options.currency.toUpperCase()) {
    return { ok: false, reason: "currency_mismatch" };
  }

  if (options?.expectedAmountMinor != null && options.expectedAmountMinor > 0) {
    const paidMinor = toMinorUnits(tx.amount, currency);
    if (paidMinor + 1 < options.expectedAmountMinor) {
      return { ok: false, reason: "amount_insufficient" };
    }
  }

  return { ok: true, tx };
}

/** Major units for Flutterwave refund body. */
export function flutterwaveRefundAmountMajor(
  amountInSmallestUnit: number | undefined,
  currency: string,
): number | undefined {
  if (amountInSmallestUnit == null) return undefined;
  return fromMinorUnits(amountInSmallestUnit, currency);
}
