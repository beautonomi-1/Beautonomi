import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PaystackInitParams = {
  email: string;
  amountInSmallestUnit: number;
  currency?: string;
  reference?: string;
  callback_url?: string;
  metadata?: Record<string, any>;
  split_code?: string;
  subaccount?: string;
};

export async function getPaystackSecretKey(): Promise<string> {
  // Prefer DB-managed secret, fallback to env
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await (supabase.from("platform_secrets") as any)
      .select("paystack_secret_key")
      .limit(1)
      .maybeSingle();

    const key = data?.paystack_secret_key;
    if (key && typeof key === "string" && key.trim().length > 0) return key.trim();
  } catch {
    // ignore and fall back to env
  }

  const envKey = process.env.PAYSTACK_SECRET_KEY;
  if (!envKey) throw new Error("Paystack secret key not configured");
  return envKey;
}

export async function initializePaystackTransaction(params: PaystackInitParams) {
  const secretKey = await getPaystackSecretKey();

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountInSmallestUnit,
      currency: params.currency || "ZAR",
      reference: params.reference,
      callback_url: params.callback_url,
      metadata: params.metadata,
      ...(params.split_code ? { split_code: params.split_code } : {}),
      ...(params.subaccount ? { subaccount: params.subaccount } : {}),
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || "Paystack initialize failed");
  }

  return data as {
    status: boolean;
    message: string;
    data: { authorization_url: string; access_code: string; reference: string };
  };
}

