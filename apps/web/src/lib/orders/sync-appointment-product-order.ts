import type { SupabaseClient } from "@supabase/supabase-js";

type BookingProductRow = {
  id: string;
  product_id: string | null;
  product_variant_id?: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  products?: { name?: string | null } | { name?: string | null }[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function orderStatusForBooking(status?: string | null): string {
  if (status === "cancelled" || status === "no_show") return "cancelled";
  return "confirmed";
}

function paymentStatusForBooking(status?: string | null): string {
  return status === "paid" ? "paid" : "pending";
}

/**
 * Mirror appointment retail lines into product_orders as a fulfillment task.
 *
 * `booking_products` remain the accounting source of truth; appointment product
 * orders are excluded from product revenue reports to avoid double counting.
 */
export async function syncAppointmentProductOrder(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ orderId: string | null; skipped?: string }> {
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      `
      id, booking_number, provider_id, customer_id, tenant_id, location_id,
      status, payment_status, currency, scheduled_at, customer_name, customer_phone,
      customers:users!bookings_customer_id_fkey(id, full_name, phone),
      booking_products(
        id, product_id, product_variant_id, quantity, unit_price, total_price,
        products:products!booking_products_product_id_fkey(id, name)
      )
    `
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) throw bookingError;
  if (!booking) return { orderId: null, skipped: "booking_not_found" };

  const products = ((booking as any).booking_products || []) as BookingProductRow[];
  const validProducts = products.filter((p) => p.product_id && Number(p.quantity || 0) > 0);

  const { data: existing } = await supabase
    .from("product_orders")
    .select("id, status")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (validProducts.length === 0) {
    if (existing && !["delivered", "cancelled", "refunded"].includes(String((existing as any).status))) {
      await supabase
        .from("product_orders")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: "Products removed from appointment",
        })
        .eq("id", (existing as any).id);
    }
    return { orderId: existing ? String((existing as any).id) : null, skipped: "no_products" };
  }

  const subtotal = validProducts.reduce((sum, p) => {
    const qty = Number(p.quantity || 0);
    const unit = Number(p.unit_price || 0);
    const total = Number(p.total_price || 0);
    return sum + (total > 0 ? total : qty * unit);
  }, 0);

  const customer = one((booking as any).customers);
  const orderPayload: Record<string, unknown> = {
    tenant_id: (booking as any).tenant_id ?? null,
    customer_id: (booking as any).customer_id ?? null,
    provider_id: (booking as any).provider_id,
    booking_id: bookingId,
    status: orderStatusForBooking((booking as any).status),
    fulfillment_type: "collection",
    collection_location_id: (booking as any).location_id ?? null,
    subtotal,
    tax_amount: 0,
    delivery_fee: 0,
    discount_amount: 0,
    platform_fee: 0,
    total_amount: subtotal,
    currency: (booking as any).currency || "ZAR",
    payment_status: paymentStatusForBooking((booking as any).payment_status),
    payment_method: "booking",
    order_source: "appointment",
    customer_name: customer?.full_name ?? (booking as any).customer_name ?? null,
    customer_phone: customer?.phone ?? (booking as any).customer_phone ?? null,
    confirmed_at: new Date().toISOString(),
    ...(orderStatusForBooking((booking as any).status) === "cancelled"
      ? { cancelled_at: new Date().toISOString(), cancellation_reason: "Appointment cancelled" }
      : {}),
  };

  let orderId = existing ? String((existing as any).id) : "";
  if (orderId) {
    const { error: updateError } = await supabase
      .from("product_orders")
      .update(orderPayload)
      .eq("id", orderId);
    if (updateError) throw updateError;
  } else {
    const { data: seqData } = await supabase.rpc("nextval" as any, {
      seq_name: "product_order_number_seq",
    });
    const { data: inserted, error: insertError } = await supabase
      .from("product_orders")
      .insert({
        ...orderPayload,
        order_number: `BO-A${seqData ?? Date.now()}`,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    orderId = String((inserted as any).id);
  }

  await supabase.from("product_order_items").delete().eq("order_id", orderId);

  const itemRows = validProducts.map((p) => {
    const product = one(p.products);
    const qty = Math.max(1, Math.floor(Number(p.quantity || 1)) || 1);
    const unit = Number(p.unit_price || 0);
    const total = Number(p.total_price || 0) || qty * unit;
    return {
      order_id: orderId,
      product_id: p.product_id,
      product_variant_id: p.product_variant_id ?? null,
      product_name: product?.name || "Product",
      product_image_url: null,
      quantity: qty,
      unit_price: unit,
      total_price: total,
    };
  });

  const { error: itemsError } = await supabase.from("product_order_items").insert(itemRows);
  if (itemsError) throw itemsError;

  return { orderId };
}
