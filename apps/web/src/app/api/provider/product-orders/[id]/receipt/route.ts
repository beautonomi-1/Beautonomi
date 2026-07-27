import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  forbiddenResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { hasPermission, isProviderOwner } from "@/lib/auth/permissions";
import { getTenantRegionConfig } from "@/lib/regions/config";
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
  customer_id: string | null;
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
  customer?: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
    phone?: string | null;
  } | null;
  collection_location?: {
    id: string;
    name?: string | null;
    address_line1?: string | null;
    city?: string | null;
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
  items?: OrderItemRow[] | null;
  provider?: {
    id: string;
    business_name?: string | null;
    receipt_header?: string | null;
    receipt_footer?: string | null;
  } | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const url = new URL(request.url);
    const downloadToken = url.searchParams.get("token");
    let user: { id: string; role: string };
    if (downloadToken) {
      const parsed = parseReceiptDownloadToken(downloadToken, {
        kind: "provider_order_receipt",
        subjectId: id,
      });
      if (!parsed) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
      const { data: userRow } = await admin
        .from("users")
        .select("id, role")
        .eq("id", parsed.userId)
        .maybeSingle();
      if (!userRow) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
      user = {
        id: userRow.id as string,
        role: (userRow.role as string) || "provider_owner",
      };
    } else {
      const authed = await requireRoleInApi(
        ["provider_owner", "provider_staff", "superadmin"],
        request,
      );
      user = { id: authed.user.id, role: authed.user.role as string };
      const owner = await isProviderOwner(user.id, request);
      if (
        !owner &&
        user.role !== "superadmin" &&
        !(await hasPermission(user.id, "view_sales", undefined, request))
      ) {
        return forbiddenResponse("You do not have permission to view product order receipts");
      }
    }

    const { data: orderRaw, error } = await (admin.from("product_orders") as any)
      .select(
        `
        *,
        items:product_order_items (
          id, product_id, product_variant_id, product_name, product_image_url, quantity, unit_price, total_price,
          product_variant:product_variants(id, option_values)
        ),
        customer:users!product_orders_customer_id_fkey (
          id, full_name, email, avatar_url, phone
        ),
        delivery_address:user_addresses (
          id, label, address_line1, address_line2, city, state, postal_code, country
        ),
        collection_location:provider_locations (
          id, name, address_line1, city
        ),
        provider:providers (
          id, business_name, phone, user_id, receipt_header, receipt_footer
        )
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !orderRaw) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    const order = orderRaw as ProductOrderRow;

    if (user.role !== "superadmin") {
      const pid = order.provider_id;
      if (!pid) {
        return forbiddenResponse("Invalid order record");
      }
      if (!(await userHasProviderAccessAdmin(admin, user.id, pid))) {
        return forbiddenResponse("You do not have access to this order");
      }
    }

    const tenantRegion = order.tenant_id
      ? await getTenantRegionConfig(order.tenant_id)
      : null;
    const currencyFallback = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const core = buildOrderReceiptCore({
      order: order as unknown as Record<string, unknown>,
      items: order.items ?? [],
    });

    const prov = order.provider as {
      business_name?: string | null;
      phone?: string | null;
      user_id?: string | null;
      receipt_header?: string | null;
      receipt_footer?: string | null;
    } | null;
    let providerOwnerEmail: string | null = null;
    if (prov?.user_id) {
      const { data: ownerRow } = await admin
        .from("users")
        .select("email")
        .eq("id", prov.user_id)
        .maybeSingle();
      providerOwnerEmail = (ownerRow as { email?: string | null } | null)?.email ?? null;
    }

    const receipt = {
      order_number: order.order_number,
      order_date: order.created_at,
      status: order.status,
      fulfillment_type: order.fulfillment_type,
      customer: order.customer,
      customer_name: core.customer_name,
      customer_phone: core.customer_phone,
      provider_id: order.provider_id,
      provider: prov
        ? {
            business_name: prov.business_name ?? null,
            phone: prov.phone ?? null,
            email: providerOwnerEmail,
          }
        : null,
      receipt_header: prov?.receipt_header ?? null,
      receipt_footer: prov?.receipt_footer ?? null,
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
      staff_id: core.staff_id,
      refund_method: core.refund_method,
      refunded_amount: core.refunded_amount,
      refunded_at: core.refunded_at,
      refund_reason: core.refund_reason,
    };

    return NextResponse.json({ receipt });
  } catch (error: unknown) {
    console.error("Error generating provider product order receipt:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate order receipt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

