import type { SupabaseClient } from "@supabase/supabase-js";
import type { TerminalMerchantApplication } from "@/lib/terminal-merchant/types";
import { TERMINAL_MERCHANT_VENDOR } from "@/lib/terminal-merchant/types";

/** Provider has an active PayCloud merchant assignment — bypass onboarding. */
export async function providerHasActivePaycloudMerchant(
  supabase: SupabaseClient,
  providerId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from("paycloud_terminals")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .limit(1);

  if ((count ?? 0) > 0) return true;

  const { data: approvedWithMerchant } = await supabase
    .from("terminal_merchant_applications")
    .select("id, paycloud_merchant_id")
    .eq("provider_id", providerId)
    .eq("vendor_slug", TERMINAL_MERCHANT_VENDOR)
    .eq("status", "approved")
    .not("paycloud_merchant_id", "is", null)
    .maybeSingle();

  if (approvedWithMerchant?.paycloud_merchant_id) return true;

  return false;
}

export async function getApprovedTerminalMerchantApplication(
  supabase: SupabaseClient,
  providerId: string,
  vendorSlug = TERMINAL_MERCHANT_VENDOR,
): Promise<TerminalMerchantApplication | null> {
  const { data } = await supabase
    .from("terminal_merchant_applications")
    .select("*")
    .eq("provider_id", providerId)
    .eq("vendor_slug", vendorSlug)
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as TerminalMerchantApplication | null) ?? null;
}

export async function getOrCreateDraftApplication(
  supabase: SupabaseClient,
  providerId: string,
  tenantId: string,
  vendorSlug = TERMINAL_MERCHANT_VENDOR,
): Promise<TerminalMerchantApplication> {
  const { data: existing } = await supabase
    .from("terminal_merchant_applications")
    .select("*")
    .eq("provider_id", providerId)
    .eq("vendor_slug", vendorSlug)
    .not("status", "in", '("approved","declined","cancelled")')
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as TerminalMerchantApplication;

  const { data: created, error } = await supabase
    .from("terminal_merchant_applications")
    .insert({
      tenant_id: tenantId,
      provider_id: providerId,
      vendor_slug: vendorSlug,
      status: "draft",
    })
    .select("*")
    .single();

  if (error) throw error;
  return created as TerminalMerchantApplication;
}

export async function resolveMerchantOnboardingGate(
  supabase: SupabaseClient,
  providerId: string,
  productVendorSlug?: string | null,
): Promise<{
  requiresOnboarding: boolean;
  applicationId: string | null;
  bypassReason: "active_merchant" | "approved_application" | null;
}> {
  const slug = (productVendorSlug ?? TERMINAL_MERCHANT_VENDOR).trim().toLowerCase();
  if (slug !== TERMINAL_MERCHANT_VENDOR && slug !== "paycloud") {
    return { requiresOnboarding: false, applicationId: null, bypassReason: null };
  }

  const hasMerchant = await providerHasActivePaycloudMerchant(supabase, providerId);
  if (hasMerchant) {
    return { requiresOnboarding: false, applicationId: null, bypassReason: "active_merchant" };
  }

  const { data: activeApp } = await supabase
    .from("terminal_merchant_applications")
    .select("id, status")
    .eq("provider_id", providerId)
    .eq("vendor_slug", TERMINAL_MERCHANT_VENDOR)
    .not("status", "in", '("approved","declined","cancelled")')
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    requiresOnboarding: true,
    applicationId: activeApp?.id ?? null,
    bypassReason: null,
  };
}

/** When merchant onboarding is no longer required, clear order gate flags. */
export async function clearMerchantOnboardingGateForOrder(
  supabase: SupabaseClient,
  orderId: string,
  providerId: string,
  productVendorSlug?: string | null,
): Promise<boolean> {
  const gate = await resolveMerchantOnboardingGate(supabase, providerId, productVendorSlug);
  if (gate.requiresOnboarding) return false;

  const { data: order } = await supabase
    .from("terminal_orders")
    .select("integration_setup_status, terminal_products(requires_integration_setup)")
    .eq("id", orderId)
    .maybeSingle();

  if ((order as { integration_setup_status?: string } | null)?.integration_setup_status !==
    "awaiting_merchant_onboarding") {
    return false;
  }

  const needsSetup =
    (order as { terminal_products?: { requires_integration_setup?: boolean } }).terminal_products
      ?.requires_integration_setup === true;

  await supabase
    .from("terminal_orders")
    .update({
      integration_setup_status: needsSetup ? "pending" : "not_required",
    })
    .eq("id", orderId);

  return true;
}

export async function applyMerchantOnboardingGateToOrder(
  supabase: SupabaseClient,
  orderId: string,
  providerId: string,
  tenantId: string | null,
  productVendorSlug?: string | null,
): Promise<{ applicationId: string | null; gated: boolean }> {
  const gate = await resolveMerchantOnboardingGate(supabase, providerId, productVendorSlug);
  if (!gate.requiresOnboarding) {
    await clearMerchantOnboardingGateForOrder(supabase, orderId, providerId, productVendorSlug);
    return { applicationId: gate.applicationId, gated: false };
  }

  let applicationId = gate.applicationId;
  if (!applicationId && tenantId) {
    const app = await getOrCreateDraftApplication(supabase, providerId, tenantId);
    applicationId = app.id;
  }

  if (applicationId) {
    await supabase
      .from("terminal_orders")
      .update({
        merchant_application_id: applicationId,
        integration_setup_status: "awaiting_merchant_onboarding",
      })
      .eq("id", orderId);
    return { applicationId, gated: true };
  }

  return { applicationId: null, gated: false };
}

export async function ungateOrdersAfterApproval(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<number> {
  const { data: orders } = await supabase
    .from("terminal_orders")
    .select("id, terminal_products(requires_integration_setup)")
    .eq("merchant_application_id", applicationId)
    .eq("integration_setup_status", "awaiting_merchant_onboarding");

  if (!orders?.length) return 0;

  for (const row of orders) {
    const needsSetup =
      (row as { terminal_products?: { requires_integration_setup?: boolean } }).terminal_products
        ?.requires_integration_setup === true;
    await supabase
      .from("terminal_orders")
      .update({
        integration_setup_status: needsSetup ? "pending" : "not_required",
      })
      .eq("id", (row as { id: string }).id);
  }

  return orders.length;
}
