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
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * 42703 = undefined_column. Surfaces both for missing scalar columns and for
 * `.select()` embed hints where the FK alias doesn't resolve. We treat any
 * "column/relationship does not exist" error as a signal to retry with a
 * leaner select rather than crash the whole booking create.
 */
function isMissingColumnOrRelationship(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (
    typeof code === "string" &&
    (code === "42703" || code === "PGRST200" || code === "PGRST201")
  ) {
    return true;
  }
  const message = (error as { message?: unknown }).message;
  if (typeof message === "string") {
    const lower = message.toLowerCase();
    if (lower.includes("does not exist")) return true;
    if (lower.includes("could not find a relationship")) return true;
    if (lower.includes("schema cache")) return true;
  }
  return false;
}

function orderStatusForBooking(status?: string | null): string {
  if (status === "cancelled" || status === "no_show") return "cancelled";
  return "confirmed";
}

function paymentStatusForBooking(status?: string | null): string {
  return status === "paid" ? "paid" : "pending";
}

function recurringSeriesAligned(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (a == null && b == null) return true;
  if (a != null && b != null) return a === b;
  return false;
}

type BookingRowForRelink = {
  id: string;
  provider_id: string;
  customer_id: string | null;
  scheduled_at: string | null;
  /** When set, must match the other booking’s series to relink; when both null, time match alone is enough. */
  recurring_series_id: string | null;
};

/**
 * Edge cases: a fulfillment row was linked to another booking (duplicate visit row,
 * cron retry, or pre-link migration). Before upsert, point `product_orders.booking_id`
 * at this booking when the slot + customer + series match the linked booking.
 */
async function relinkMislinkedAppointmentProductOrder(
  supabase: SupabaseClient,
  booking: BookingRowForRelink
): Promise<void> {
  const bookingId = booking.id;
  if (!booking.customer_id || !booking.scheduled_at) return;

  const { data: already } = await supabase
    .from("product_orders")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (already) return;

  const targetMs = new Date(booking.scheduled_at).getTime();
  if (!Number.isFinite(targetMs)) return;

  const { data: candidates } = await supabase
    .from("product_orders")
    .select("id, booking_id")
    .eq("provider_id", booking.provider_id)
    .eq("customer_id", booking.customer_id)
    .eq("order_source", "appointment")
    .neq("booking_id", bookingId)
    .not("booking_id", "is", null)
    .limit(40);

  if (!candidates?.length) return;

  const seriesSelf = booking.recurring_series_id;

  for (const c of candidates) {
    const otherBookingId = c.booking_id as string;
    let row: { scheduled_at?: string | null; recurring_series_id?: string | null } | null = null;
    const { data: ob, error: obErr } = await supabase
      .from("bookings")
      .select("scheduled_at, recurring_series_id")
      .eq("id", otherBookingId)
      .maybeSingle();
    if (obErr && isMissingColumnOrRelationship(obErr)) {
      // Old schema without `recurring_series_id` — try scalar-only select.
      const { data: scalar } = await supabase
        .from("bookings")
        .select("scheduled_at")
        .eq("id", otherBookingId)
        .maybeSingle();
      row = scalar as { scheduled_at?: string | null } | null;
    } else if (!obErr) {
      row = ob as { scheduled_at?: string | null; recurring_series_id?: string | null } | null;
    }
    if (!row) continue;

    const otherMs = row.scheduled_at ? new Date(row.scheduled_at).getTime() : NaN;
    if (!Number.isFinite(otherMs) || otherMs !== targetMs) continue;
    if (!recurringSeriesAligned(seriesSelf, row.recurring_series_id ?? null)) continue;

    const { error } = await supabase
      .from("product_orders")
      .update({ booking_id: bookingId })
      .eq("id", c.id);
    if (!error) return;
  }
}

/**
 * Load the booking + nested rows we need for the order sync, with progressive
 * fallbacks when a database is missing optional columns or FK hints. This
 * keeps the booking create path working on environments that haven't yet
 * applied every commerce/recurring migration (e.g. missing
 * `bookings.recurring_series_id` or the explicit `products` FK alias).
 */
async function loadBookingForSync(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ booking: Record<string, unknown> | null; productsSelectFailed: boolean }> {
  // §Provider-audit 2026-05 (product sync 42703 root cause): the `bookings`
  // table never had `customer_name` / `customer_phone` columns — those are
  // on `product_orders` (migration 240). Selecting them here threw 42703
  // through every variant, then the "scalar fallback" (which also listed
  // those columns) threw too, surfacing as
  // `Failed to sync product order for this appointment (db:42703)` whenever
  // a provider created a booking containing both services and products.
  // The customer name/phone we actually want come from the embedded
  // `customers:users` relation (`full_name`, `phone`).
  const selectVariants = [
    // Full select with explicit FK aliases (best path when migrations are current).
    `
      id, booking_number, provider_id, customer_id, tenant_id, location_id,
      status, payment_status, currency, scheduled_at,
      recurring_series_id,
      customers:users!bookings_customer_id_fkey(id, full_name, phone),
      booking_products(
        id, product_id, product_variant_id, quantity, unit_price, total_price,
        products:products!booking_products_product_id_fkey(id, name)
      )
    `,
    // Drop the explicit FK alias on `customers` / `products` (PostgREST can usually
    // infer the relationship by table name alone).
    `
      id, booking_number, provider_id, customer_id, tenant_id, location_id,
      status, payment_status, currency, scheduled_at,
      recurring_series_id,
      customers:users(id, full_name, phone),
      booking_products(
        id, product_id, product_variant_id, quantity, unit_price, total_price,
        products(id, name)
      )
    `,
    // Drop `recurring_series_id` (added by migration 531) and the embedded `products`.
    `
      id, booking_number, provider_id, customer_id, tenant_id, location_id,
      status, payment_status, currency, scheduled_at,
      customers:users(id, full_name, phone),
      booking_products(
        id, product_id, product_variant_id, quantity, unit_price, total_price
      )
    `,
    // Drop `product_variant_id` (added by migration 285) — last resort so the
    // booking still reads on very old databases.
    `
      id, booking_number, provider_id, customer_id, tenant_id, location_id,
      status, payment_status, currency, scheduled_at,
      customers:users(id, full_name, phone),
      booking_products(
        id, product_id, quantity, unit_price, total_price
      )
    `,
  ];

  let lastError: unknown = null;
  for (let i = 0; i < selectVariants.length; i++) {
    const { data, error } = await supabase
      .from("bookings")
      .select(selectVariants[i])
      .eq("id", bookingId)
      .maybeSingle();
    if (!error) {
      return {
        booking: data as unknown as Record<string, unknown> | null,
        productsSelectFailed: false,
      };
    }
    lastError = error;
    if (!isMissingColumnOrRelationship(error)) {
      throw error;
    }
  }

  // Every embed variant failed — fall back to a scalar-only read and load the
  // line items separately so we never block a booking create on a stale schema.
  // Truly scalar: no embeds and no columns that aren't guaranteed to exist on
  // bookings (no customer_name/customer_phone — those live on product_orders).
  const { data: scalar, error: scalarError } = await supabase
    .from("bookings")
    .select(
      `
      id, booking_number, provider_id, customer_id, tenant_id, location_id,
      status, payment_status, currency, scheduled_at
    `
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (scalarError) throw scalarError ?? lastError;
  if (!scalar) return { booking: null, productsSelectFailed: true };
  return { booking: scalar as Record<string, unknown>, productsSelectFailed: true };
}

async function loadBookingProductsFallback(
  supabase: SupabaseClient,
  bookingId: string
): Promise<BookingProductRow[]> {
  const variants = [
    "id, product_id, product_variant_id, quantity, unit_price, total_price",
    "id, product_id, quantity, unit_price, total_price",
  ];
  for (const select of variants) {
    const { data, error } = await supabase
      .from("booking_products")
      .select(select)
      .eq("booking_id", bookingId);
    if (!error) return (data || []) as unknown as BookingProductRow[];
    if (!isMissingColumnOrRelationship(error)) throw error;
  }
  return [];
}

async function loadProductNameMap(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(productIds.filter(Boolean)));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data, error } = await supabase.from("products").select("id, name").in("id", unique);
  if (error) return map;
  for (const row of (data || []) as Array<{ id: string; name?: string | null }>) {
    if (row.id) map.set(row.id, row.name ?? "");
  }
  return map;
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
  const { booking, productsSelectFailed } = await loadBookingForSync(supabase, bookingId);
  if (!booking) return { orderId: null, skipped: "booking_not_found" };

  let products = ((booking as any).booking_products || []) as BookingProductRow[];
  if (productsSelectFailed) {
    products = await loadBookingProductsFallback(supabase, bookingId);
  }
  const validProducts = products.filter((p) => p.product_id && Number(p.quantity || 0) > 0);
  const providerId = String((booking as any).provider_id ?? "");

  let tenantId = ((booking as any).tenant_id as string | null) ?? null;
  if (!tenantId && providerId) {
    const { data: providerRow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    tenantId = ((providerRow as any)?.tenant_id as string | null) ?? null;
  }
  if (!tenantId) {
    throw new Error("Appointment booking is missing tenant_id for product order sync");
  }

  let collectionLocationId = ((booking as any).location_id as string | null) ?? null;
  if (!collectionLocationId && providerId) {
    const { data: primaryLocation } = await supabase
      .from("provider_locations")
      .select("id")
      .eq("provider_id", providerId)
      .eq("is_primary", true)
      .maybeSingle();
    collectionLocationId = ((primaryLocation as any)?.id as string | null) ?? null;
    if (!collectionLocationId) {
      const { data: fallbackLocation } = await supabase
        .from("provider_locations")
        .select("id")
        .eq("provider_id", providerId)
        .limit(1)
        .maybeSingle();
      collectionLocationId = ((fallbackLocation as any)?.id as string | null) ?? null;
    }
  }

  await relinkMislinkedAppointmentProductOrder(supabase, {
    id: (booking as any).id,
    provider_id: (booking as any).provider_id,
    customer_id: (booking as any).customer_id ?? null,
    scheduled_at: (booking as any).scheduled_at ?? null,
    // When the booking select fell back to a schema without `recurring_series_id`
    // we treat the value as null; relink still matches on slot + customer.
    recurring_series_id:
      "recurring_series_id" in (booking as Record<string, unknown>)
        ? ((booking as any).recurring_series_id ?? null)
        : null,
  });

  const { data: existing } = await supabase
    .from("product_orders")
    .select("id, status")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (validProducts.length === 0) {
    if (
      existing &&
      !["delivered", "cancelled", "refunded"].includes(String((existing as any).status))
    ) {
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
    tenant_id: tenantId,
    customer_id: (booking as any).customer_id ?? null,
    provider_id: providerId,
    booking_id: bookingId,
    status: orderStatusForBooking((booking as any).status),
    fulfillment_type: "collection",
    collection_location_id: collectionLocationId,
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

  // Remove known-optional columns when a 42703 surfaces — keeps the sync
  // working on older databases that don't yet have migrations 240/285/525/550
  // (booking_id, order_source, customer_name/phone, platform_fee, etc.).
  // §Provider-audit 2026-05: also strip `customer_name` / `customer_phone`
  // so an env missing migration 240 on product_orders does not abort the
  // booking with a 42703.
  const stripOptional = (payload: Record<string, unknown>): Record<string, unknown> => {
    const next = { ...payload };
    delete next.booking_id;
    delete next.order_source;
    delete next.platform_fee;
    delete next.customer_name;
    delete next.customer_phone;
    return next;
  };

  let orderId = existing ? String((existing as any).id) : "";
  if (orderId) {
    let { error: updateError } = await supabase
      .from("product_orders")
      .update(orderPayload)
      .eq("id", orderId);
    if (updateError && isMissingColumnOrRelationship(updateError)) {
      const retry = await supabase
        .from("product_orders")
        .update(stripOptional(orderPayload))
        .eq("id", orderId);
      updateError = retry.error;
    }
    if (updateError) throw updateError;
  } else {
    const { data: seqData } = await supabase.rpc("nextval" as any, {
      seq_name: "product_order_number_seq",
    });
    const firstOrderNumber = `BO-A${seqData ?? Date.now()}`;
    let { data: inserted, error: insertError } = await supabase
      .from("product_orders")
      .insert({
        ...orderPayload,
        order_number: firstOrderNumber,
      })
      .select("id")
      .single();
    if (insertError && isMissingColumnOrRelationship(insertError)) {
      const retry = await supabase
        .from("product_orders")
        .insert({
          ...stripOptional(orderPayload),
          order_number: firstOrderNumber,
        })
        .select("id")
        .single();
      inserted = retry.data as typeof inserted;
      insertError = retry.error;
    }
    if (insertError) {
      if ((insertError as any)?.code === "23505") {
        const retryOrderNumber = `BO-A${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const { data: retryInserted, error: retryInsertError } = await supabase
          .from("product_orders")
          .insert({
            ...orderPayload,
            order_number: retryOrderNumber,
          })
          .select("id")
          .single();
        if (!retryInsertError && retryInserted) {
          orderId = String((retryInserted as any).id);
        } else if (retryInsertError) {
          throw retryInsertError;
        }
      }
      if (!orderId) {
        const { data: raced } = await supabase
          .from("product_orders")
          .select("id")
          .eq("booking_id", bookingId)
          .maybeSingle();
        if (raced) {
          orderId = String((raced as any).id);
          const { error: updateAfterRace } = await supabase
            .from("product_orders")
            .update(orderPayload)
            .eq("id", orderId);
          if (updateAfterRace) throw updateAfterRace;
        } else {
          throw insertError;
        }
      }
    } else {
      orderId = String((inserted as any).id);
    }
  }

  await supabase.from("product_order_items").delete().eq("order_id", orderId);

  // When the booking embed fell back, `products` won't be nested on
  // `booking_products` — fetch product names in a single follow-up query so
  // the order items still carry a readable label.
  const nameMap = productsSelectFailed
    ? await loadProductNameMap(
        supabase,
        validProducts.map((p) => String(p.product_id)).filter(Boolean) as string[]
      )
    : null;

  const itemRows = validProducts.map((p) => {
    const product = one(p.products);
    const qty = Math.max(1, Math.floor(Number(p.quantity || 1)) || 1);
    const unit = Number(p.unit_price || 0);
    const total = Number(p.total_price || 0) || qty * unit;
    const name =
      product?.name ||
      (nameMap && p.product_id ? nameMap.get(String(p.product_id)) : "") ||
      "Product";
    return {
      order_id: orderId,
      product_id: p.product_id,
      product_variant_id: p.product_variant_id ?? null,
      product_name: name,
      product_image_url: null,
      quantity: qty,
      unit_price: unit,
      total_price: total,
    };
  });

  const insertItems = async (rows: Array<Record<string, unknown>>): Promise<{ error: unknown }> => {
    const { error } = await supabase.from("product_order_items").insert(rows);
    return { error };
  };

  let { error: itemsError } = await insertItems(itemRows);
  if (itemsError && isMissingColumnOrRelationship(itemsError)) {
    // Old DB without `product_variant_id` on `product_order_items` — drop the
    // column from the payload and retry once.
    const lean = itemRows.map(({ product_variant_id: _ignored, ...rest }) => rest);
    const retry = await insertItems(lean);
    itemsError = retry.error;
  }
  if (itemsError) throw itemsError;

  return { orderId };
}
