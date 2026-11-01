import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  badRequestResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/promotions/[id]/redemptions
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("manage_marketing", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const { data: promotion } = await supabase
      .from("promotions")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (!promotion) {
      return notFoundResponse("Promotion not found");
    }

    const admin = getSupabaseAdmin();

    const { data: usageRows, error: usageErr } = await admin
      .from("promotion_usage")
      .select(
        "id, user_id, booking_id, product_order_id, discount_amount, used_at",
      )
      .eq("promotion_id", id)
      .order("used_at", { ascending: false })
      .limit(20);

    if (usageErr) {
      throw usageErr;
    }

    const { data: sumRows, error: sumErr } = await admin
      .from("promotion_usage")
      .select("discount_amount")
      .eq("promotion_id", id);

    if (sumErr) {
      throw sumErr;
    }

    const totalDiscount = (sumRows ?? []).reduce(
      (acc, r) => acc + Number((r as { discount_amount?: number }).discount_amount ?? 0),
      0,
    );

    const userIds = [...new Set((usageRows ?? []).map((r) => (r as { user_id: string }).user_id))];
    const bookingIds = (usageRows ?? [])
      .map((r) => (r as { booking_id?: string | null }).booking_id)
      .filter(Boolean) as string[];
    const orderIds = (usageRows ?? [])
      .map((r) => (r as { product_order_id?: string | null }).product_order_id)
      .filter(Boolean) as string[];

    const [usersRes, bookingsRes, ordersRes] = await Promise.all([
      userIds.length
        ? admin.from("users").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] }),
      bookingIds.length
        ? admin.from("bookings").select("id, booking_number").in("id", bookingIds)
        : Promise.resolve({ data: [] }),
      orderIds.length
        ? admin.from("product_orders").select("id, order_number").in("id", orderIds)
        : Promise.resolve({ data: [] }),
    ]);

    const userNameById = new Map(
      (usersRes.data ?? []).map((u) => [
        (u as { id: string }).id,
        (u as { full_name?: string | null }).full_name ?? "Customer",
      ]),
    );
    const bookingNumById = new Map(
      (bookingsRes.data ?? []).map((b) => [
        (b as { id: string }).id,
        (b as { booking_number?: string }).booking_number,
      ]),
    );
    const orderNumById = new Map(
      (ordersRes.data ?? []).map((o) => [
        (o as { id: string }).id,
        (o as { order_number?: string }).order_number,
      ]),
    );

    const redemptions = (usageRows ?? []).map((raw) => {
      const r = raw as {
        user_id: string;
        booking_id?: string | null;
        product_order_id?: string | null;
        discount_amount: number;
        used_at: string;
      };
      const bookingId = r.booking_id ?? null;
      const orderId = r.product_order_id ?? null;
      return {
        client_name: userNameById.get(r.user_id) ?? "Customer",
        booking_number: bookingId ? bookingNumById.get(bookingId) ?? null : null,
        order_number: orderId ? orderNumById.get(orderId) ?? null : null,
        discount_amount: Number(r.discount_amount ?? 0),
        used_at: r.used_at,
      };
    });

    return successResponse({
      total_discount: Math.round(totalDiscount * 100) / 100,
      redemptions,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch redemptions");
  }
}
