import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { withProductOrderAmountStillDue } from "@/lib/payments/resolve-paystack-initialize-amount";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { hasPermission } from "@/lib/auth/permissions";
import { redactBookingCustomerContacts } from "@/lib/provider/redact-booking-customer-contact";
import {
  applyProviderProductOrderQueueFilter,
  type ProviderProductOrderQueue,
} from "@/lib/orders/provider-product-order-queue-filter";
import {
  mergeProductOrderContact,
  PRODUCT_ORDER_COLUMNS_WITHOUT_CONTACT,
} from "@/lib/orders/product-order-columns";

const PRODUCT_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "ready_for_collection",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

/**
 * GET /api/provider/product-orders
 * List product orders for the provider
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("view_sales", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const canViewClients =
      user.role === "superadmin" ||
      (await hasPermission(user.id, "view_clients", undefined, request));
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");
    const queueParam = searchParams.get("queue")?.trim();
    const queue: ProviderProductOrderQueue =
      queueParam === "awaiting_payment" ? "awaiting_payment" : "fulfillment";
    const bookingId = searchParams.get("booking_id")?.trim();
    const offset = (page - 1) * limit;
    const applyQueue = !bookingId;

    // Includes order_source, fulfillment_type, payment_method for appointment-linked
    // fulfillment UI on booking detail (collection vs delivery routing).
    let query = (supabase.from("product_orders") as any)
      .select(
        `
        ${PRODUCT_ORDER_COLUMNS_WITHOUT_CONTACT},
        items:product_order_items (
          id, product_id, product_variant_id, product_name, product_image_url, quantity, unit_price, total_price,
          fulfilment_status, fulfilled_qty,
          product_variant:product_variants(id, option_values)
        ),
        customer:users!product_orders_customer_id_fkey (
          id, full_name, email, phone, avatar_url, identity_verified
        )
      `,
        { count: "exact" },
      )
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }
    if (bookingId) {
      query = query.eq("booking_id", bookingId);
    }
    if (applyQueue) {
      query = applyProviderProductOrderQueueFilter(query, queue);
    }

    const { data: orders, error, count } = await query;
    if (error) throw error;

    const baseCountQuery = () => {
      let q = (supabase.from("product_orders") as any)
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .match(bookingId ? { booking_id: bookingId } : {});
      if (applyQueue) {
        q = applyProviderProductOrderQueueFilter(q, "fulfillment");
      }
      return q;
    };

    let awaitingPaymentCountQuery = (supabase.from("product_orders") as any)
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId);
    if (applyQueue) {
      awaitingPaymentCountQuery = applyProviderProductOrderQueueFilter(
        awaitingPaymentCountQuery,
        "awaiting_payment",
      );
    } else {
      awaitingPaymentCountQuery = awaitingPaymentCountQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    }

    const statusCountResults = await Promise.all([
      baseCountQuery(),
      ...PRODUCT_ORDER_STATUSES.map((orderStatus) => {
        let q = (supabase.from("product_orders") as any)
          .select("id", { count: "exact", head: true })
          .eq("provider_id", providerId)
          .eq("status", orderStatus)
          .match(bookingId ? { booking_id: bookingId } : {});
        if (applyQueue && orderStatus === "pending") {
          q = applyProviderProductOrderQueueFilter(q, "fulfillment");
        }
        return q;
      }),
      awaitingPaymentCountQuery,
    ]);

    for (const result of statusCountResults) {
      if (result.error) throw result.error;
    }

    const statusCounts = PRODUCT_ORDER_STATUSES.reduce<Record<string, number>>(
      (acc, orderStatus, index) => {
        acc[orderStatus] = statusCountResults[index + 1]?.count ?? 0;
        return acc;
      },
      {} as Record<string, number>,
    );
    statusCounts.awaiting_payment =
      statusCountResults[PRODUCT_ORDER_STATUSES.length + 1]?.count ?? 0;

    const ordersWithDue = await withProductOrderAmountStillDue(getSupabaseAdmin(), orders ?? []);
    const ordersWithContact = await mergeProductOrderContact(ordersWithDue, canViewClients);

    return successResponse({
      orders: redactBookingCustomerContacts(ordersWithContact, canViewClients),
      status_counts: statusCounts,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalAll: statusCountResults[0]?.count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch product orders");
  }
}
