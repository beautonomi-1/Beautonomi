import type { SupabaseClient } from "@supabase/supabase-js";
import { hasProviderCustomerActivityRelationship } from "@/lib/provider/client-access";
import { createOrResolveShadowCustomer } from "@/lib/users/create-shadow-customer";

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

  const shadowResult = await createOrResolveShadowCustomer({
    supabaseAdmin,
    fullName,
    phone: phoneRaw || null,
    phoneCountryCode: customerPhoneCountryCode,
    providerId,
    shadowSource: "product_sale",
    createdByUserId: staffUserId,
  });

  if (shadowResult.ok === false) {
    return { ok: false, message: shadowResult.message, code: shadowResult.code };
  }

  const customerId = shadowResult.customerId;
  const matchedExisting = shadowResult.matchedExisting;
  const matchedOn = shadowResult.matchedOn;

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
    provider_supplied_phone: shadowResult.phone,
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
