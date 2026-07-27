import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { parseReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";
import { buildOrderReceiptCore } from "@/lib/receipts/build-order-receipt";

type OrderItemRow = {
  product_name?: string | null;
  product_image_url?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
  product_variant?: { option_values?: Record<string, unknown> | null } | null;
};

type ProductOrderRow = {
  id: string;
  tenant_id?: string | null;
  order_number: string;
  customer_id: string;
  provider_id: string;
  status: string;
  fulfillment_type: "collection" | "delivery";
  subtotal: number;
  tax_amount?: number | null;
  delivery_fee?: number | null;
  discount_amount?: number | null;
  platform_fee?: number | null;
  wallet_amount?: number | null;
  total_amount: number;
  currency: string;
  payment_status: string;
  created_at?: string | null;
  confirmed_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  provider?: {
    id: string;
    business_name?: string | null;
    slug?: string | null;
    thumbnail_url?: string | null;
    logo_url?: string | null;
    receipt_header?: string | null;
    receipt_footer?: string | null;
  } | null;
  delivery_address?: {
    id: string;
    label?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
  collection_location?: {
    id: string;
    name?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    phone?: string | null;
    working_hours?: string | null;
  } | null;
  items?: OrderItemRow[] | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Support short-lived HMAC `?token=` so the sibling PDF route (and the
    // native customer app) can authenticate without a Bearer/session — the
    // token binds kind + order id + user id + expiry.
    const url = new URL(request.url);
    const downloadToken = url.searchParams.get("token");
    let tokenUserId: string | null = null;
    if (downloadToken) {
      const parsed = parseReceiptDownloadToken(downloadToken, {
        kind: "customer_order_receipt",
        subjectId: id,
      });
      if (!parsed) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
      tokenUserId = parsed.userId;
    }

    let user: { id: string; role: string };
    if (tokenUserId) {
      const { data: userRow } = await getSupabaseAdmin()
        .from("users")
        .select("id, role")
        .eq("id", tokenUserId)
        .maybeSingle();
      if (!userRow) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
      user = {
        id: userRow.id as string,
        role: (userRow.role as string) || "customer",
      };
    } else {
      const authed = await requireRoleInApi(
        ["customer", "provider_owner", "provider_staff", "superadmin"],
        request,
      );
      user = { id: authed.user.id, role: authed.user.role as string };
    }
    const supabase = tokenUserId ? getSupabaseAdmin() : await getSupabaseServer(request);

    const { data: orderRaw, error } = await (supabase.from("product_orders") as any)
      .select(
        `
        *,
        items:product_order_items (
          id, product_id, product_variant_id, product_name, product_image_url, quantity, unit_price, total_price,
          product_variant:product_variants (id, option_values)
        ),
        provider:providers (
          id, business_name, slug, thumbnail_url, receipt_header, receipt_footer, phone, email
        ),
        delivery_address:user_addresses (
          id, label, address_line1, address_line2, city, state, postal_code, country
        ),
        collection_location:provider_locations (
          id, name, address_line1, address_line2, city, state, postal_code, phone, working_hours
        )
      `
      )
      .eq("id", id)
      .eq("customer_id", user.id)
      .single();

    if (error || !orderRaw) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    const order = orderRaw as ProductOrderRow;
    let prov = order.provider;
    if (prov && "thumbnail_url" in prov) {
      prov = {
        ...prov,
        logo_url: prov.thumbnail_url ?? prov.logo_url ?? null,
      };
      order.provider = prov;
    }

    const tenantRegion = order.tenant_id
      ? await getTenantRegionConfig(order.tenant_id)
      : null;
    const currencyFallback = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const subtotal = Number(order.subtotal || 0);
    const core = buildOrderReceiptCore({
      order: order as unknown as Record<string, unknown>,
      items: order.items ?? [],
    });

    const headerText = prov?.receipt_header ?? null;
    const footerText = prov?.receipt_footer ?? null;
    const providerPublic = prov
      ? {
          id: prov.id,
          business_name: prov.business_name ?? null,
          slug: prov.slug ?? null,
          thumbnail_url: prov.thumbnail_url ?? null,
          logo_url: prov.logo_url ?? prov.thumbnail_url ?? null,
          phone: (prov as { phone?: string | null }).phone ?? null,
          email: (prov as { email?: string | null }).email ?? null,
        }
      : null;

    const receipt = {
      order_number: order.order_number,
      order_date: order.created_at,
      status: order.status,
      fulfillment_type: order.fulfillment_type,
      customer_id: order.customer_id,
      provider: providerPublic,
      receipt_header: headerText,
      receipt_footer: footerText,
      delivery_address: order.fulfillment_type === "delivery" ? order.delivery_address : null,
      collection_location:
        order.fulfillment_type === "collection" ? order.collection_location : null,
      items: core.items,
      subtotal: core.subtotal,
      tax: core.tax,
      delivery_fee: core.deliveryFee,
      discount: core.discount,
      platform_fee: core.platformFee,
      wallet_amount: core.walletPaid,
      total: core.totalFromRow,
      currency: order.currency || currencyFallback,
      payment_status: order.payment_status,
      payment_method: core.payment_method,
      payment_reference: core.payment_reference,
      paid_at: core.paid_at,
      amount_paid: core.amount_paid,
      balance_due: core.balance_due,
      tracking_number: core.tracking_number,
      carrier: core.carrier,
      tracking_url: core.tracking_url,
      estimated_delivery_date: core.estimated_delivery_date,
      delivery_instructions: core.delivery_instructions,
      shipped_at: core.shipped_at,
      delivered_at: core.delivered_at,
      cancelled_at: core.cancelled_at,
      cancellation_reason: core.cancellation_reason,
      order_source: core.order_source,
      booking_id: core.booking_id,
      refund_method: core.refund_method,
      refunded_amount: core.refunded_amount,
      refunded_at: core.refunded_at,
      refund_reason: core.refund_reason,
    };

    return NextResponse.json({ receipt });
  } catch (error: unknown) {
    console.error("Error generating product order receipt:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate order receipt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

