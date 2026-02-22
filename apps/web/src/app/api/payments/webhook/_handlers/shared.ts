/**
 * Shared utilities, types, and helpers for Paystack webhook handlers
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type { SupabaseClient };

/**
 * Top-level Paystack webhook event envelope.
 * `data` varies per event type so we keep it loosely typed.
 */
export interface PaystackEvent {
  event: string;
  data: Record<string, any>;
  id?: string | number;
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

/**
 * Save Paystack authorization code as a payment method
 */
export async function savePaystackAuthorization({
  userId,
  email,
  authorizationCode,
  lastFour,
  expiryMonth,
  expiryYear,
  cardBrand,
  isDefault,
  supabase,
}: {
  userId: string;
  email: string;
  authorizationCode: string;
  lastFour: string;
  expiryMonth: number;
  expiryYear: number;
  cardBrand: string;
  isDefault?: boolean;
  supabase: SupabaseClient;
}) {
  // Check if this authorization code already exists for this user
  const { data: existing } = await (supabase
    .from("payment_methods") as any)
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "paystack")
    .eq("provider_payment_method_id", authorizationCode)
    .eq("is_active", true)
    .maybeSingle();

  if (existing) {
    // Update existing payment method
    const updateData: any = {
      last_four: lastFour,
      expiry_month: expiryMonth,
      expiry_year: expiryYear,
      card_brand: cardBrand.toLowerCase(),
      updated_at: new Date().toISOString(),
    };

    if (isDefault) {
      // Unset other defaults first
      await (supabase
        .from("payment_methods") as any)
        .update({ is_default: false })
        .eq("user_id", userId)
        .eq("is_default", true);
      updateData.is_default = true;
    }

    await (supabase
      .from("payment_methods") as any)
      .update(updateData)
      .eq("id", existing.id);

    return existing.id;
  }

  // If this is set as default, unset other defaults
  if (isDefault) {
    await (supabase
      .from("payment_methods") as any)
      .update({ is_default: false })
      .eq("user_id", userId)
      .eq("is_default", true);
  }

  // Create new payment method
  const { data: method, error } = await (supabase
    .from("payment_methods") as any)
    .insert({
      user_id: userId,
      type: "card",
      provider: "paystack",
      provider_payment_method_id: authorizationCode,
      last_four: lastFour,
      expiry_month: expiryMonth,
      expiry_year: expiryYear,
      card_brand: cardBrand.toLowerCase(),
      metadata: {
        email,
        saved_via: "paystack_transaction",
      },
      is_default: isDefault || false,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return method.id;
}

/**
 * Generate a unique, human-readable gift card code (16 chars, uppercase)
 */
export function generateGiftCardCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "GC-";
  for (let i = 0; i < 16; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
