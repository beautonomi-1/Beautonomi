import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";

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
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);

    let providerId: string | null = null;
    if (user.role !== "superadmin") {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return NextResponse.json(
          { error: "Provider not found" },
          { status: 404 }
        );
      }
    }

    let query = (supabase.from("product_orders") as any).select(
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
        )
      `
    );

    query = query.eq("id", id);
    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const { data: orderRaw, error } = await query.single();

    if (error || !orderRaw) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    const order = orderRaw as ProductOrderRow;

    const tenantRegion = order.tenant_id
      ? await getTenantRegionConfig(order.tenant_id)
      : null;
    const currencyFallback = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const subtotal = Number(order.subtotal || 0);
    const tax = Number(order.tax_amount || 0);
    const deliveryFee = Number(order.delivery_fee || 0);
    const discount = Number(order.discount_amount || 0);
    const totalFromRow =
      order.total_amount != null && !Number.isNaN(Number(order.total_amount))
        ? Number(order.total_amount)
        : subtotal + tax + deliveryFee - discount;

    const items =
      order.items?.map((it: OrderItemRow) => {
        const ov = it.product_variant?.option_values;
        const variantLabel =
          ov && typeof ov === "object"
            ? ` · ${Object.values(ov).join(" / ")}`
            : "";
        return {
          name: `${it.product_name || "Product"}${variantLabel}`,
          quantity: it.quantity || 1,
          price: Number(it.unit_price || 0),
          total:
            Number(it.total_price || 0) ||
            Number(it.unit_price || 0) * Number(it.quantity || 1),
        };
      }) || [];

    const receipt = {
      order_number: order.order_number,
      order_date: order.created_at,
      status: order.status,
      fulfillment_type: order.fulfillment_type,
      customer: order.customer,
      provider_id: order.provider_id,
      delivery_address: order.fulfillment_type === "delivery" ? order.delivery_address : null,
      collection_location:
        order.fulfillment_type === "collection" ? order.collection_location : null,
      items,
      subtotal,
      tax,
      delivery_fee: deliveryFee,
      discount,
      total: totalFromRow,
      currency: order.currency || currencyFallback,
      payment_status: order.payment_status,
    };

    return NextResponse.json({ receipt });
  } catch (error: unknown) {
    console.error("Error generating provider product order receipt:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate order receipt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

