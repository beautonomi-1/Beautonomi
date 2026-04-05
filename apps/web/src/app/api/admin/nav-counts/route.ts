import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchAllProviderIdsForTenant } from "@/lib/tenant/admin-tenant-scope";
import { fetchOrphanRefundPaymentTxsForTenant } from "@/lib/admin/payment-transactions-tenant-scope";

/**
 * GET /api/admin/nav-counts
 * Returns pending/open counts for admin sidebar badges (superadmin only).
 * Keys match admin nav hrefs so the shell can show counts per menu item.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const tenantProviderIds = await fetchAllProviderIdsForTenant(supabase, tenantId);

    const [
      verificationsResult,
      payoutsResult,
      supportTicketsResult,
      refundsResult,
      disputesResult,
      providersPendingResult,
      bookingsPendingResult,
      userReportsResult,
      productOrdersPendingResult,
      productReturnsResult,
    ] = await Promise.all([
      supabase
        .from("user_verifications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("tenant_id", tenantId),
      supabase
        .from("payouts")
        .select("id, providers!inner(tenant_id)", { count: "exact", head: true })
        .in("status", ["pending", "processing"])
        .eq("providers.tenant_id", tenantId),
      tenantProviderIds.length > 0
        ? supabase
            .from("support_tickets")
            .select("id", { count: "exact", head: true })
            .in("status", ["open", "in_progress"])
            .in("provider_id", tenantProviderIds)
        : Promise.resolve({ count: 0 }),
      (async () => {
        const { count: bookingPending } = await supabase
          .from("payment_transactions")
          .select("id, booking:bookings!inner(tenant_id)", { count: "exact", head: true })
          .or("transaction_type.eq.refund,refund_amount.not.is.null,status.eq.success")
          .eq("status", "pending")
          .eq("booking.tenant_id", tenantId);
        const orphanPending = await fetchOrphanRefundPaymentTxsForTenant(supabase, tenantId, {
          startDate: null,
          endDate: null,
          status: "pending",
          transactionType: null,
        });
        return { count: (bookingPending ?? 0) + orphanPending.length };
      })(),
      supabase
        .from("booking_disputes")
        .select("id, bookings!inner(tenant_id)", { count: "exact", head: true })
        .eq("status", "open")
        .eq("bookings.tenant_id", tenantId),
      supabase
        .from("providers")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_approval")
        .eq("tenant_id", tenantId),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("tenant_id", tenantId),
      supabase
        .from("user_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("tenant_id", tenantId),
      tenantProviderIds.length > 0
        ? supabase
            .from("product_orders")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
            .in("provider_id", tenantProviderIds)
        : Promise.resolve({ count: 0 }),
      tenantProviderIds.length > 0
        ? supabase
            .from("product_return_requests")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending", "escalated"])
            .in("provider_id", tenantProviderIds)
        : Promise.resolve({ count: 0 }),
    ]);

    const counts: Record<string, number> = {
      "/admin/verifications": verificationsResult.count ?? 0,
      "/admin/payouts": payoutsResult.count ?? 0,
      "/admin/support-tickets": supportTicketsResult.count ?? 0,
      "/admin/refunds": refundsResult.count ?? 0,
      "/admin/disputes": disputesResult.count ?? 0,
      "/admin/providers": providersPendingResult.count ?? 0,
      "/admin/bookings": bookingsPendingResult.count ?? 0,
      "/admin/user-reports": userReportsResult.count ?? 0,
      "/admin/ecommerce/orders": productOrdersPendingResult.count ?? 0,
      "/admin/ecommerce/returns": productReturnsResult.count ?? 0,
    };

    return successResponse(counts);
  } catch (error) {
    return handleApiError(error, "Failed to fetch nav counts");
  }
}
