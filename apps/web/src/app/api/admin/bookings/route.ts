import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * GET /api/admin/bookings
 *
 * Get all platform bookings with filters. Uses admin client so superadmin sees all bookings.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const { searchParams } = new URL(request.url);

    let query = supabase
      .from("bookings")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId);

    const status = searchParams.get("status");
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const date = searchParams.get("date");
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      query = query
        .gte("scheduled_at", startDate.toISOString())
        .lt("scheduled_at", endDate.toISOString());
    }

    const providerId = searchParams.get("provider_id");
    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const customerId = searchParams.get("customer_id");
    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    const search = searchParams.get("search")?.trim();
    let searchCustomerIds: string[] | null = null;
    let searchProviderIds: string[] | null = null;

    if (search) {
      const safe = search.replace(/[%_]/g, "");
      const { data: matchingBookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("booking_number", `%${safe}%`)
        .limit(200);

      const { data: matchingCustomers } = await supabase
        .from("users")
        .select("id")
        .or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`)
        .limit(200);
      searchCustomerIds = (matchingCustomers ?? []).map((u: { id: string }) => u.id);

      const { data: matchingProviders } = await supabase
        .from("providers")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("business_name", `%${safe}%`)
        .limit(200);
      searchProviderIds = (matchingProviders ?? []).map((p: { id: string }) => p.id);

      const bookingIds = (matchingBookings ?? []).map((b: { id: string }) => b.id);
      const allIds = [...bookingIds];
      if (searchCustomerIds.length > 0 || searchProviderIds.length > 0 || allIds.length > 0) {
        const orClauses: string[] = [];
        if (allIds.length > 0) orClauses.push(`id.in.(${allIds.join(",")})`);
        if (searchCustomerIds.length > 0) orClauses.push(`customer_id.in.(${searchCustomerIds.join(",")})`);
        if (searchProviderIds.length > 0) orClauses.push(`provider_id.in.(${searchProviderIds.join(",")})`);
        query = query.or(orClauses.join(","));
      } else {
        return successResponse({ bookings: [], total: 0, page: 0, limit: 0 });
      }
    }

    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(500, Math.max(1, parseInt(limitParam, 10) || 200)) : 200;
    const rawPage = Math.max(0, parseInt(searchParams.get("page") || "0", 10) || 0);
    const offset = rawPage * limit;

    const { data: bookings, error, count } = await query
      .order("scheduled_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching bookings:", error);
      console.error("Query details:", {
        status,
        date,
        errorMessage: error.message,
        errorCode: error.code,
        errorDetails: error.details
      });
      // Return empty array instead of throwing to avoid 500 error
      return successResponse({ bookings: [], total: count ?? 0, page: rawPage, limit });
    }

    // Handle case where no bookings are found
    if (!bookings || bookings.length === 0) {
      return successResponse([]);
    }

    // Fetch related data separately
    type BookingRow = { customer_id?: string; provider_id?: string; location_id?: string };
    const customerIds = [...new Set((bookings as BookingRow[]).map((b) => b.customer_id).filter(Boolean))];
    const providerIds = [...new Set((bookings as BookingRow[]).map((b) => b.provider_id).filter(Boolean))];
    const locationIds = [...new Set((bookings as BookingRow[]).map((b) => b.location_id).filter(Boolean))];

    type UserRow = { id: string; full_name?: string; email?: string; phone?: string };
    type ProviderRow = { id: string; business_name?: string };
    let customersData: UserRow[] = [];
    if (customerIds.length > 0) {
      try {
        const { data, error: customersError } = await supabase
          .from("users")
          .select("id, full_name, email, phone")
          .in("id", customerIds);
        if (!customersError) {
          customersData = data || [];
        }
      } catch (err) {
        console.error("Error fetching customers:", err);
      }
    }
    const customersMap = new Map(customersData.map((u) => [u.id, u]));

    let providersData: ProviderRow[] = [];
    if (providerIds.length > 0) {
      try {
        const { data, error: providersError } = await supabase
          .from("providers")
          .select("id, business_name")
          .eq("tenant_id", tenantId)
          .in("id", providerIds);
        if (!providersError) {
          providersData = data || [];
        }
      } catch (err) {
        console.error("Error fetching providers:", err);
      }
    }
    const providersMap = new Map(providersData.map((p) => [p.id, p]));

    type LocationRow = { id: string; name?: string; address_line1?: string; city?: string; country?: string };
    let locationsData: LocationRow[] = [];
    if (locationIds.length > 0) {
      try {
        const { data, error: locationsError } = await supabase
          .from("provider_locations")
          .select("id, name, address_line1, city")
          .in("id", locationIds);
        if (!locationsError) {
          locationsData = (data || []) as LocationRow[];
        }
      } catch (err) {
        console.error("Error fetching locations:", err);
      }
    }
    const locationsMap = new Map(locationsData.map((l) => [l.id, l]));

    type BookingFull = BookingRow & { id: string; booking_number?: string; status?: string; location_type?: string; location_id?: string; address?: string; scheduled_at?: string; completed_at?: string | null; cancelled_at?: string | null; cancellation_reason?: string | null; services?: unknown[]; addons?: unknown[]; package_id?: string | null; subtotal?: number; tip_amount?: number; total_amount?: number; total_paid?: number; total_refunded?: number; wallet_amount?: number; gift_card_amount?: number; currency?: string; payment_status?: string; payment_method?: string | null; special_requests?: string | null; loyalty_points_earned?: number; created_at?: string; updated_at?: string };
    const transformedBookings = (bookings as BookingFull[]).map((booking) => {
      const totalAmount = Number(booking.total_amount ?? 0);
      const totalPaid = Number(booking.total_paid ?? 0);
      const totalRefunded = Number(booking.total_refunded ?? 0);
      const walletAmount = Number(booking.wallet_amount ?? 0);
      const giftCardAmount = Number(booking.gift_card_amount ?? 0);
      const effectivePaid = Math.max(0, totalPaid - totalRefunded);
      const ps = ((booking.payment_status || "") as string).toLowerCase();
      const outstandingBalance = ps === "refunded" ? 0 : Math.max(0, totalAmount - effectivePaid - walletAmount - giftCardAmount);
      const customer = customersMap.get(booking.customer_id ?? "");
      const provider = providersMap.get(booking.provider_id ?? "");
      const location = locationsMap.get(booking.location_id ?? "");
      return {
        id: booking.id,
        booking_number: booking.booking_number,
        customer_id: booking.customer_id,
        customer_name: customer?.full_name || null,
        customer_email: customer?.email || null,
        customer_phone: customer?.phone || null,
        provider_id: booking.provider_id,
        provider_name: provider?.business_name || null,
        status: booking.status,
        location_type: booking.location_type,
        location_id: booking.location_id,
        location_name: location?.name || null,
        location_city: location?.city || null,
        address: booking.address || null,
        scheduled_at: booking.scheduled_at,
        completed_at: booking.completed_at || null,
        cancelled_at: booking.cancelled_at || null,
        cancellation_reason: booking.cancellation_reason || null,
        services: booking.services || [],
        addons: booking.addons || [],
        package_id: booking.package_id || null,
        subtotal: booking.subtotal || 0,
        tip_amount: booking.tip_amount || 0,
        total_amount: totalAmount,
        total_paid: totalPaid,
        wallet_amount: walletAmount,
        gift_card_amount: giftCardAmount,
        outstanding_balance: outstandingBalance,
        currency: booking.currency || lastResortCurrency,
        payment_status: booking.payment_status,
        payment_method: booking.payment_method || null,
        special_requests: booking.special_requests || null,
        loyalty_points_earned: booking.loyalty_points_earned || 0,
        created_at: booking.created_at,
        updated_at: booking.updated_at,
      };
    });

    return successResponse({
      bookings: transformedBookings,
      total: count ?? transformedBookings.length,
      page: rawPage,
      limit,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch bookings");
  }
}

