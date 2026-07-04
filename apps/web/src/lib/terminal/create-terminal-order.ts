import type { SupabaseClient } from "@supabase/supabase-js";
import type { TerminalCommercialModel } from "@/lib/terminal/record-terminal-order-payment";
import {
  assertCommercialModelEligible,
  getTerminalCheckoutEligibility,
  type TerminalProductForEligibility,
} from "@/lib/terminal/terminal-checkout-eligibility";
import {
  resolveProductFulfillmentType,
  validateTerminalOrderFulfillment,
  assertValidCollectionLocation,
  type CreateTerminalOrderFulfillmentInput,
  type DeliveryAddress,
} from "@/lib/terminal/terminal-order-fulfillment";
import { computeTerminalOrderTotals } from "@/lib/terminal/compute-terminal-order-totals";

export type CreateTerminalOrderInput = {
  product_id: string;
  commercial_model: TerminalCommercialModel;
  quantity?: number;
  fulfillment_type?: CreateTerminalOrderFulfillmentInput["fulfillment_type"];
  delivery_address?: DeliveryAddress | null;
  collection_location_id?: string | null;
  subscription_id?: string | null;
};

function computeUnitPrice(
  commercialModel: TerminalCommercialModel,
  product: {
    upfront_price?: number | null;
    rental_price?: number | null;
    monthly_price?: number | null;
  },
): number {
  if (commercialModel === "once_off_purchase") return Number(product.upfront_price ?? 0);
  if (commercialModel === "rental") return Number(product.rental_price ?? product.monthly_price ?? 0);
  if (commercialModel === "subscription_bundle") return 0;
  return Number(product.monthly_price ?? product.upfront_price ?? 0);
}

export async function createTerminalOrderForProvider(
  supabase: SupabaseClient,
  providerId: string,
  tenantId: string | null,
  input: CreateTerminalOrderInput,
): Promise<{ order: Record<string, unknown>; requires_payment: boolean }> {
  if (input.commercial_model === "subscription_bundle") {
    throw new Error("Use allocate-from-subscription for subscription-included terminals.");
  }

  const { data: product, error: productErr } = await supabase
    .from("terminal_products")
    .select(
      "id, name, vendor, product_code, sku, upfront_price, monthly_price, rental_price, accounting_model, currency, gl_revenue_account, gl_cogs_account, gl_inventory_account, gl_rental_income_account, tax_code, active, subscription_plan_eligible, fulfillment_type, requires_integration_setup, integration_vendor_slug, stock_status",
    )
    .eq("id", input.product_id)
    .maybeSingle();

  if (productErr || !product || !(product as { active?: boolean }).active) {
    throw new Error("Product not found or unavailable");
  }

  const p = product as TerminalProductForEligibility & {
    gl_revenue_account?: string | null;
    gl_cogs_account?: string | null;
    gl_inventory_account?: string | null;
    gl_rental_income_account?: string | null;
    tax_code?: string | null;
    requires_integration_setup?: boolean;
    fulfillment_type?: CreateTerminalOrderFulfillmentInput["fulfillment_type"] | null;
    stock_status?: string | null;
  };

  if (["out_of_stock", "discontinued"].includes(String(p.stock_status ?? ""))) {
    throw new Error("This product is not available to order.");
  }

  const eligibility = await getTerminalCheckoutEligibility(supabase, providerId, p, tenantId);
  assertCommercialModelEligible(input.commercial_model, eligibility);

  const fulfillmentType = await resolveProductFulfillmentType(
    supabase,
    input.product_id,
    input.fulfillment_type ?? p.fulfillment_type ?? null,
  );

  validateTerminalOrderFulfillment({
    fulfillment_type: fulfillmentType,
    delivery_address: input.delivery_address,
    collection_location_id: input.collection_location_id,
  });

  if (fulfillmentType === "collection" && input.collection_location_id) {
    await assertValidCollectionLocation(supabase, tenantId, input.collection_location_id);
  }

  const commercialModel = input.commercial_model;
  const unitPrice = computeUnitPrice(commercialModel, p);
  const quantity = input.quantity ?? 1;
  const { taxAmount, totalAmount } = await computeTerminalOrderTotals(supabase, {
    unitPrice,
    quantity,
  });

  const integrationSetupStatus = "not_required";

  const { data: order, error: orderErr } = await supabase
    .from("terminal_orders")
    .insert({
      tenant_id: tenantId,
      provider_id: providerId,
      product_id: input.product_id,
      commercial_model: commercialModel,
      quantity,
      unit_price: unitPrice,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      currency: p.currency ?? "ZAR",
      delivery_address: input.delivery_address ?? null,
      collection_location_id: input.collection_location_id ?? null,
      fulfillment_type: fulfillmentType,
      subscription_id: input.subscription_id ?? null,
      order_status: "pending",
      fulfillment_status: "pending",
      invoice_status: "pending",
      integration_setup_status: integrationSetupStatus,
      gl_revenue_account: p.gl_revenue_account ?? null,
      gl_cogs_account: p.gl_cogs_account ?? null,
      gl_inventory_account: p.gl_inventory_account ?? null,
      gl_rental_income_account: p.gl_rental_income_account ?? null,
      tax_code: p.tax_code ?? null,
      accounting_sync_status: "pending",
    })
    .select()
    .single();

  if (orderErr) throw orderErr;

  const option = eligibility.options.find((o) => o.commercial_model === commercialModel);
  return {
    order: order as Record<string, unknown>,
    requires_payment: option?.requires_payment ?? totalAmount > 0,
  };
}

export async function allocateTerminalFromSubscription(
  supabase: SupabaseClient,
  providerId: string,
  tenantId: string | null,
  input: Omit<CreateTerminalOrderInput, "commercial_model">,
): Promise<{ order: Record<string, unknown> }> {
  const { data: product, error: productErr } = await supabase
    .from("terminal_products")
    .select(
      "id, name, vendor, product_code, sku, upfront_price, monthly_price, rental_price, currency, gl_revenue_account, gl_cogs_account, gl_inventory_account, gl_rental_income_account, tax_code, active, subscription_plan_eligible, fulfillment_type, requires_integration_setup, integration_vendor_slug, stock_status",
    )
    .eq("id", input.product_id)
    .maybeSingle();

  if (productErr || !product || !(product as { active?: boolean }).active) {
    throw new Error("Product not found or unavailable");
  }

  const p = product as TerminalProductForEligibility & {
    gl_revenue_account?: string | null;
    gl_cogs_account?: string | null;
    gl_inventory_account?: string | null;
    gl_rental_income_account?: string | null;
    tax_code?: string | null;
    requires_integration_setup?: boolean;
    fulfillment_type?: CreateTerminalOrderFulfillmentInput["fulfillment_type"] | null;
    stock_status?: string | null;
  };

  if (["out_of_stock", "discontinued"].includes(String(p.stock_status ?? ""))) {
    throw new Error("This product is not available to order.");
  }

  const eligibility = await getTerminalCheckoutEligibility(supabase, providerId, p, tenantId);
  assertCommercialModelEligible("subscription_bundle", eligibility);

  if (!eligibility.bundle.subscriptionId) {
    throw new Error("No active subscription found for terminal allocation.");
  }

  const fulfillmentType = await resolveProductFulfillmentType(
    supabase,
    input.product_id,
    input.fulfillment_type ?? p.fulfillment_type ?? null,
  );

  validateTerminalOrderFulfillment({
    fulfillment_type: fulfillmentType,
    delivery_address: input.delivery_address,
    collection_location_id: input.collection_location_id,
  });

  if (fulfillmentType === "collection" && input.collection_location_id) {
    await assertValidCollectionLocation(supabase, tenantId, input.collection_location_id);
  }

  const quantity = input.quantity ?? 1;
  const { data: order, error: orderErr } = await supabase
    .from("terminal_orders")
    .insert({
      tenant_id: tenantId,
      provider_id: providerId,
      product_id: input.product_id,
      commercial_model: "subscription_bundle",
      quantity,
      unit_price: 0,
      tax_amount: 0,
      total_amount: 0,
      currency: p.currency ?? "ZAR",
      delivery_address: input.delivery_address ?? null,
      collection_location_id: input.collection_location_id ?? null,
      fulfillment_type: fulfillmentType,
      subscription_id: eligibility.bundle.subscriptionId,
      order_status: "pending",
      fulfillment_status: "pending",
      invoice_status: "pending",
      integration_setup_status: "not_required",
      gl_revenue_account: p.gl_revenue_account ?? null,
      gl_cogs_account: p.gl_cogs_account ?? null,
      gl_inventory_account: p.gl_inventory_account ?? null,
      gl_rental_income_account: p.gl_rental_income_account ?? null,
      tax_code: p.tax_code ?? null,
      accounting_sync_status: "pending",
    })
    .select()
    .single();

  if (orderErr) throw orderErr;

  const orderId = (order as { id: string }).id;
  const reference = `terminal_sub_alloc_${orderId}`;

  const { recordTerminalOrderPayment } = await import("@/lib/terminal/record-terminal-order-payment");
  const paymentResult = await recordTerminalOrderPayment({
    supabase,
    terminalOrderId: orderId,
    reference,
    amountMajor: 0,
    commercialModel: "subscription_bundle",
    source: "subscription_allocation",
    provider: "subscription",
  });

  if (paymentResult.transitionedToPaid) {
    const { notifyTerminalOrderPaidIfTransitioned } = await import(
      "@/lib/terminal/notify-terminal-order-paid"
    );
    await notifyTerminalOrderPaidIfTransitioned(supabase, orderId, {
      transitionedToPaid: true,
    });
  }

  const { data: refreshed } = await supabase
    .from("terminal_orders")
    .select("*")
    .eq("id", orderId)
    .single();

  return { order: (refreshed ?? order) as Record<string, unknown> };
}
