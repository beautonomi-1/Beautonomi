import type { SupabaseClient } from "@supabase/supabase-js";
import type { AramexCredentials, ShippingProviderId, ShippingRuntimeCredentials } from "@beautonomi/shipping";
import {
  decryptCredentialsPayload,
  encryptCredentialsPayload,
  maskSecretHint,
} from "@/lib/orders/shipping-credentials-crypto";

export type CourierCredentialsPublicStatus = {
  "courier-guy": { connected: boolean; verifiedAt: string | null; apiKeyHint: string | null; baseUrl: string | null };
  "bob-go": { connected: boolean; verifiedAt: string | null; apiKeyHint: string | null; baseUrl: string | null };
  aramex: {
    connected: boolean;
    verifiedAt: string | null;
    usernameHint: string | null;
    accountNumberHint: string | null;
    accountEntity: string | null;
    accountCountryCode: string | null;
    domesticProductType: string | null;
    baseUrl: string | null;
  };
};

type CredentialsRow = {
  provider_id: string;
  courier_guy_ciphertext: string | null;
  bob_go_ciphertext: string | null;
  aramex_ciphertext: string | null;
  courier_guy_base_url: string | null;
  bob_go_base_url: string | null;
  aramex_base_url: string | null;
  aramex_account_entity: string | null;
  aramex_account_country_code: string | null;
  aramex_domestic_product_type: string | null;
  courier_guy_verified_at: string | null;
  bob_go_verified_at: string | null;
  aramex_verified_at: string | null;
};

export async function loadProviderCourierCredentialsRow(
  admin: SupabaseClient,
  providerId: string,
): Promise<CredentialsRow | null> {
  const { data } = await (admin.from("provider_courier_credentials") as any)
    .select("*")
    .eq("provider_id", providerId)
    .maybeSingle();
  return (data as CredentialsRow | null) ?? null;
}

export function buildShippingRuntimeFromProviderRow(
  row: CredentialsRow | null,
  preference: ShippingProviderId,
): ShippingRuntimeCredentials | null {
  if (!row) return null;
  if (preference === "courier-guy" && row.courier_guy_ciphertext) {
    const payload = decryptCredentialsPayload<{ apiKey: string }>(row.courier_guy_ciphertext);
    if (!payload.apiKey?.trim()) return null;
    return {
      "courier-guy": {
        apiKey: payload.apiKey.trim(),
        baseUrl: row.courier_guy_base_url?.trim() || undefined,
      },
    };
  }
  if (preference === "bob-go" && row.bob_go_ciphertext) {
    const payload = decryptCredentialsPayload<{ apiKey: string }>(row.bob_go_ciphertext);
    if (!payload.apiKey?.trim()) return null;
    return {
      "bob-go": {
        apiKey: payload.apiKey.trim(),
        baseUrl: row.bob_go_base_url?.trim() || undefined,
      },
    };
  }
  if (preference === "aramex" && row.aramex_ciphertext) {
    const payload = decryptCredentialsPayload<{
      accountNumber: string;
      accountPin: string;
      username: string;
      password: string;
      source?: number;
    }>(row.aramex_ciphertext);
    if (
      !payload.accountNumber?.trim() ||
      !payload.accountPin?.trim() ||
      !payload.username?.trim() ||
      !payload.password?.trim()
    ) {
      return null;
    }
    const aramex: AramexCredentials = {
      accountNumber: payload.accountNumber.trim(),
      accountPin: payload.accountPin.trim(),
      username: payload.username.trim(),
      password: payload.password.trim(),
      accountEntity: row.aramex_account_entity?.trim() || undefined,
      accountCountryCode: row.aramex_account_country_code?.trim() || undefined,
      baseUrl: row.aramex_base_url?.trim() || undefined,
      domesticProductType: row.aramex_domestic_product_type?.trim() || "ONP",
      source: payload.source,
    };
    return { aramex };
  }
  return null;
}

export function publicCourierCredentialsStatus(
  row: CredentialsRow | null,
  opts: { includeHints: boolean },
): CourierCredentialsPublicStatus {
  const empty = {
    "courier-guy": {
      connected: false,
      verifiedAt: null,
      apiKeyHint: null,
      baseUrl: null,
    },
    "bob-go": {
      connected: false,
      verifiedAt: null,
      apiKeyHint: null,
      baseUrl: null,
    },
    aramex: {
      connected: false,
      verifiedAt: null,
      usernameHint: null,
      accountNumberHint: null,
      accountEntity: null,
      accountCountryCode: null,
      domesticProductType: null,
      baseUrl: null,
    },
  };
  if (!row) return empty;

  let cgHint: string | null = null;
  let bgHint: string | null = null;
  let arUser: string | null = null;
  let arAcct: string | null = null;
  if (opts.includeHints) {
    try {
      if (row.courier_guy_ciphertext) {
        cgHint = maskSecretHint(decryptCredentialsPayload<{ apiKey: string }>(row.courier_guy_ciphertext).apiKey);
      }
    } catch {
      cgHint = "***";
    }
    try {
      if (row.bob_go_ciphertext) {
        bgHint = maskSecretHint(decryptCredentialsPayload<{ apiKey: string }>(row.bob_go_ciphertext).apiKey);
      }
    } catch {
      bgHint = "***";
    }
    try {
      if (row.aramex_ciphertext) {
        const p = decryptCredentialsPayload<{ username: string; accountNumber: string }>(row.aramex_ciphertext);
        arUser = maskSecretHint(p.username);
        arAcct = maskSecretHint(p.accountNumber);
      }
    } catch {
      arUser = "***";
      arAcct = "***";
    }
  }

  return {
    "courier-guy": {
      connected: Boolean(row.courier_guy_ciphertext),
      verifiedAt: row.courier_guy_verified_at,
      apiKeyHint: cgHint,
      baseUrl: row.courier_guy_base_url,
    },
    "bob-go": {
      connected: Boolean(row.bob_go_ciphertext),
      verifiedAt: row.bob_go_verified_at,
      apiKeyHint: bgHint,
      baseUrl: row.bob_go_base_url,
    },
    aramex: {
      connected: Boolean(row.aramex_ciphertext),
      verifiedAt: row.aramex_verified_at,
      usernameHint: arUser,
      accountNumberHint: arAcct,
      accountEntity: row.aramex_account_entity,
      accountCountryCode: row.aramex_account_country_code,
      domesticProductType: row.aramex_domestic_product_type,
      baseUrl: row.aramex_base_url,
    },
  };
}

export async function markProviderCourierVerified(
  admin: SupabaseClient,
  providerId: string,
  courier: ShippingProviderId,
): Promise<void> {
  const verifiedAt = new Date().toISOString();
  const patch: Partial<CredentialsRow> =
    courier === "courier-guy"
      ? { courier_guy_verified_at: verifiedAt }
      : courier === "bob-go"
        ? { bob_go_verified_at: verifiedAt }
        : { aramex_verified_at: verifiedAt };
  await upsertProviderCourierCredentials(admin, providerId, patch);
}

export async function upsertProviderCourierCredentials(
  admin: SupabaseClient,
  providerId: string,
  patch: Partial<CredentialsRow>,
): Promise<CredentialsRow> {
  const { data: existing } = await (admin.from("provider_courier_credentials") as any)
    .select("provider_id")
    .eq("provider_id", providerId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await (admin.from("provider_courier_credentials") as any)
      .update(patch)
      .eq("provider_id", providerId)
      .select("*")
      .single();
    if (error) throw error;
    return data as CredentialsRow;
  }

  const { data, error } = await (admin.from("provider_courier_credentials") as any)
    .insert({ provider_id: providerId, ...patch })
    .select("*")
    .single();
  if (error) throw error;
  return data as CredentialsRow;
}

export function mergeEncryptedCourierGuy(
  existing: CredentialsRow | null,
  input: { apiKey?: string; clear?: boolean },
): string | null {
  if (input.clear) return null;
  if (input.apiKey?.trim()) {
    return encryptCredentialsPayload({ apiKey: input.apiKey.trim() });
  }
  return existing?.courier_guy_ciphertext ?? null;
}

export function mergeEncryptedBobGo(
  existing: CredentialsRow | null,
  input: { apiKey?: string; clear?: boolean },
): string | null {
  if (input.clear) return null;
  if (input.apiKey?.trim()) {
    return encryptCredentialsPayload({ apiKey: input.apiKey.trim() });
  }
  return existing?.bob_go_ciphertext ?? null;
}

export function mergeEncryptedAramex(
  existing: CredentialsRow | null,
  input: {
    clear?: boolean;
    accountNumber?: string;
    accountPin?: string;
    username?: string;
    password?: string;
    source?: number;
  },
): string | null {
  if (input.clear) return null;
  const prev =
    existing?.aramex_ciphertext != null
      ? decryptCredentialsPayload<{
          accountNumber: string;
          accountPin: string;
          username: string;
          password: string;
          source?: number;
        }>(existing.aramex_ciphertext)
      : null;
  const merged = {
    accountNumber: input.accountNumber?.trim() || prev?.accountNumber || "",
    accountPin: input.accountPin?.trim() || prev?.accountPin || "",
    username: input.username?.trim() || prev?.username || "",
    password: input.password?.trim() || prev?.password || "",
    source: input.source ?? prev?.source,
  };
  if (!merged.accountNumber || !merged.accountPin || !merged.username || !merged.password) {
    return existing?.aramex_ciphertext ?? null;
  }
  return encryptCredentialsPayload(merged);
}
