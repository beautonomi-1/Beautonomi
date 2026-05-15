import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneToE164 } from "@/lib/phone";
import { hasProviderCustomerActivityRelationship } from "@/lib/provider/client-access";

function createWalkInEmail(): string {
  return `walkin-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@beautonomi.invalid`;
}

type BypassRpcResult = {
  success?: boolean;
  user_id?: string;
  error?: string;
};

export type EnsureWalkInCustomerForProductSaleInput = {
  supabaseAdmin: SupabaseClient;
  providerId: string;
  staffUserId: string;
  walletCurrency: string;
  customerName: string | null;
  customerPhone: string | null;
  /** Dial digits or ISO hint passed to `normalizePhoneToE164` (same as clients/create). */
  customerPhoneCountryCode?: string | null;
};

export type EnsureWalkInCustomerForProductSaleResult =
  | { ok: true; customerId: string }
  | { ok: false; message: string; code?: string };

/**
 * When a walk-in product sale includes a name and/or phone but no `customer_id`,
 * resolve or create a `users` row and ensure a `provider_clients` row exists so:
 * - the customer appears in the provider CRM (same outcome as booking-driven links
 *   from `bookings` → `update_provider_client_stats`), and
 * - RLS on `product_orders` (migration 526) allows `customer_id` on walk_in inserts.
 */
export async function ensureWalkInCustomerLinkedForProductSale(
  input: EnsureWalkInCustomerForProductSaleInput,
): Promise<EnsureWalkInCustomerForProductSaleResult> {
  const {
    supabaseAdmin,
    providerId,
    staffUserId,
    walletCurrency,
    customerName,
    customerPhone,
    customerPhoneCountryCode,
  } = input;

  const nameTrim = customerName?.trim() ?? "";
  const phoneRaw = customerPhone?.trim() ?? "";
  if (!nameTrim && !phoneRaw) {
    return { ok: false, message: "Customer name or phone is required to save to your client list.", code: "VALIDATION_ERROR" };
  }

  const fullName = nameTrim.length > 0 ? nameTrim : "Walk-in customer";
  const phoneNorm = phoneRaw
    ? normalizePhoneToE164(phoneRaw, customerPhoneCountryCode ?? undefined) || phoneRaw
    : null;

  let customerId: string | null = null;
  let matchedExisting = false;
  let matchedOn: "phone" | null = null;

  if (phoneRaw || phoneNorm) {
    const phoneCandidates = [...new Set([phoneRaw, phoneNorm].filter((v): v is string => Boolean(v && v.length > 0)))];
    const { data: existingUsers, error: phoneLookupErr } = await supabaseAdmin
      .from("users")
      .select("id")
      .in("phone", phoneCandidates)
      .limit(1);
    if (phoneLookupErr) {
      return { ok: false, message: phoneLookupErr.message, code: "USER_LOOKUP_ERROR" };
    }
    if (existingUsers && existingUsers.length > 0 && existingUsers[0]?.id) {
      customerId = existingUsers[0].id as string;
      matchedExisting = true;
      matchedOn = "phone";
    }
  }

  if (!customerId) {
    const email = createWalkInEmail();
    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("create_user_bypass_trigger", {
      p_email: email,
      p_full_name: fullName,
      p_phone: phoneNorm || phoneRaw || null,
      p_role: "customer",
    });

    if (rpcErr) {
      return { ok: false, message: rpcErr.message, code: "USER_CREATE_ERROR" };
    }

    const bypass = rpcData as BypassRpcResult | BypassRpcResult[] | null;
    const payload = Array.isArray(bypass) ? bypass[0] : bypass;
    if (payload?.success && payload.user_id) {
      customerId = payload.user_id;
    } else {
      try {
        const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            phone: phoneNorm || phoneRaw || null,
            role: "customer",
          },
        });
        if (createUserError || !createdUser?.user?.id) {
          return {
            ok: false,
            message:
              (payload?.error as string | undefined) ||
              createUserError?.message ||
              "Failed to create customer for walk-in sale.",
            code: "USER_CREATE_ERROR",
          };
        }
        customerId = createdUser.user.id;

        const { error: profileErr } = await supabaseAdmin.from("users").upsert(
          {
            id: customerId,
            email,
            full_name: fullName,
            phone: phoneNorm || phoneRaw || null,
            role: "customer",
          },
          { onConflict: "id" },
        );
        if (profileErr && profileErr.code !== "23505") {
          return { ok: false, message: profileErr.message, code: "USER_CREATE_ERROR" };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, message: msg, code: "USER_CREATE_ERROR" };
      }
    }
  }

  if (!customerId) {
    return { ok: false, message: "Could not resolve customer id for walk-in sale.", code: "USER_CREATE_ERROR" };
  }

  if (walletCurrency && walletCurrency !== "ZAR") {
    await supabaseAdmin.from("user_wallets").update({ currency: walletCurrency }).eq("user_id", customerId);
  }

  const hasActivity =
    matchedExisting && (await hasProviderCustomerActivityRelationship(supabaseAdmin, providerId, customerId));
  const relationshipSource = matchedExisting
    ? hasActivity
      ? "product_order"
      : "manual_existing_platform"
    : "manual_new_customer";
  const privacyLevel = matchedExisting && !hasActivity ? "limited" : "standard";
  const linkedExistingPlatform = matchedExisting;

  const { data: existingPc, error: pcSelectErr } = await supabaseAdmin
    .from("provider_clients")
    .select("id")
    .eq("provider_id", providerId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (pcSelectErr) {
    return { ok: false, message: pcSelectErr.message, code: "PROVIDER_CLIENT_ERROR" };
  }
  if (existingPc?.id) {
    return { ok: true, customerId };
  }

  const sourceMetadata = {
    linked_via: "walk_in_product_sale",
    provider_supplied_name: fullName,
    provider_supplied_phone: phoneNorm || phoneRaw || null,
    matched_on: matchedOn,
  };

  const { error: pcInsertErr } = await supabaseAdmin.from("provider_clients").insert({
    provider_id: providerId,
    customer_id: customerId,
    notes: null,
    relationship_source: relationshipSource,
    privacy_level: privacyLevel,
    source_metadata: sourceMetadata,
    linked_existing_platform_user: linkedExistingPlatform,
    created_by_user_id: staffUserId,
  });

  if (pcInsertErr) {
    if (pcInsertErr.code === "23505") {
      return { ok: true, customerId };
    }
    return { ok: false, message: pcInsertErr.message, code: "PROVIDER_CLIENT_ERROR" };
  }

  return { ok: true, customerId };
}
