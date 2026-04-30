import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { collectTenantScopedUserIds } from "@/lib/tenant/admin-tenant-scope";

/**
 * GET /api/admin/search
 * 
 * Global search across users, bookings, providers, etc.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const supabase = await getSupabaseServer(request);

    if (!supabase) {
      return handleApiError(new Error("Supabase client not available"), "Failed to search");
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        data: {
          users: [],
          bookings: [],
          providers: [],
        },
        error: null,
      });
    }

    const searchTerm = query.trim().toLowerCase();
    const tenantId = await resolveAdminApiTenantId(request);
    const scopedUserIds = await collectTenantScopedUserIds(supabase, tenantId);
    const userScopeOr =
      scopedUserIds.length > 0
        ? `preferred_home_tenant_id.eq.${tenantId},id.in.(${scopedUserIds.join(",")})`
        : `preferred_home_tenant_id.eq.${tenantId}`;

    // Search users (by email, phone, or name) — scoped to tenant
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, email, phone, full_name, role")
      .or(`email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`)
      .or(userScopeOr)
      .limit(5);

    // Search bookings — by booking number, then also try matching via customer/provider
    let bookingIds: string[] = [];

    const { data: bookingsByNumber } = await supabase
      .from("bookings")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("booking_number", `%${searchTerm}%`)
      .limit(5);
    bookingIds = (bookingsByNumber || []).map((b: { id: string }) => b.id);

    // Also search bookings by customer name/email/phone
    if (bookingIds.length < 5) {
      const matchedUserIds = (users || []).map((u: { id: string }) => u.id);
      if (matchedUserIds.length > 0) {
        const { data: bookingsByUser } = await supabase
          .from("bookings")
          .select("id")
          .eq("tenant_id", tenantId)
          .in("customer_id", matchedUserIds)
          .not("id", "in", `(${bookingIds.join(",") || "00000000-0000-0000-0000-000000000000"})`)
          .order("created_at", { ascending: false })
          .limit(5 - bookingIds.length);
        bookingIds.push(...(bookingsByUser || []).map((b: { id: string }) => b.id));
      }
    }

    let bookings: Array<{
      id: string; booking_number: string; customer_id: string;
      provider_id: string | null; status: string; created_at: string;
      customer_name: string | null; customer_email: string | null;
      provider_name: string | null;
    }> = [];

    if (bookingIds.length > 0) {
      const { data: bookingRows } = await supabase
        .from("bookings")
        .select("id, booking_number, customer_id, provider_id, status, created_at")
        .in("id", bookingIds)
        .order("created_at", { ascending: false });

      const custIds = [...new Set((bookingRows || []).map((b: { customer_id: string }) => b.customer_id).filter(Boolean))];
      const provIds = [...new Set((bookingRows || []).map((b: { provider_id: string | null }) => b.provider_id).filter(Boolean))] as string[];

      const custMap = new Map<string, { full_name: string | null; email: string }>();
      const provMap = new Map<string, string>();

      if (custIds.length > 0) {
        const { data: custRows } = await supabase.from("users").select("id, full_name, email").in("id", custIds);
        for (const c of custRows || []) custMap.set(c.id, c as { full_name: string | null; email: string });
      }
      if (provIds.length > 0) {
        const { data: provRows } = await supabase.from("providers").select("id, business_name").in("id", provIds);
        for (const p of provRows || []) provMap.set(p.id, (p as { id: string; business_name: string }).business_name);
      }

      bookings = (bookingRows || []).map((b: Record<string, unknown>) => {
        const cust = custMap.get(b.customer_id as string);
        return {
          id: b.id as string,
          booking_number: b.booking_number as string,
          customer_id: b.customer_id as string,
          provider_id: b.provider_id as string | null,
          status: b.status as string,
          created_at: b.created_at as string,
          customer_name: cust?.full_name || null,
          customer_email: cust?.email || null,
          provider_name: b.provider_id ? provMap.get(b.provider_id as string) || null : null,
        };
      });
    }

    const bookingsError = null;

    // Search providers (by business name, email, or phone). `providers` has no
    // `owner_name` / `owner_email` columns — owner info lives on the linked `users` row,
    // so matching the owner's name/email now goes via `users` and the results are joined
    // back here. Previously the `.or(... owner_name.ilike ...)` caused Postgres to error
    // and the whole provider search returned an empty list.
    let ownerMatchedProviderIds: string[] = [];
    {
      const { data: ownerRows, error: ownerErr } = await supabase
        .from("users")
        .select("id, full_name, email")
        .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .limit(25);
      if (ownerErr) {
        console.error("Error searching provider owners (users):", ownerErr);
      }
      const ownerIds = (ownerRows || []).map((u) => (u as { id: string }).id);
      if (ownerIds.length > 0) {
        const { data: provOwnerRows } = await supabase
          .from("providers")
          .select("id")
          .eq("tenant_id", tenantId)
          .in("user_id", ownerIds);
        ownerMatchedProviderIds = (provOwnerRows || []).map((p) => (p as { id: string }).id);
      }
    }

    const providerOrClauses = [
      `business_name.ilike.%${searchTerm}%`,
      `phone.ilike.%${searchTerm}%`,
    ];
    if (ownerMatchedProviderIds.length > 0) {
      providerOrClauses.push(`id.in.(${ownerMatchedProviderIds.join(",")})`);
    }

    const { data: providersRaw, error: providersError } = await supabase
      .from("providers")
      .select(
        "id, business_name, phone, status, user_id, users:user_id(full_name, email)"
      )
      .eq("tenant_id", tenantId)
      .or(providerOrClauses.join(","))
      .limit(5);

    const providers = (providersRaw || []).map((p) => {
      const row = p as {
        id: string;
        business_name?: string | null;
        phone?: string | null;
        status?: string | null;
        users?:
          | { full_name?: string | null; email?: string | null }
          | Array<{ full_name?: string | null; email?: string | null }>
          | null;
      };
      const userRow = Array.isArray(row.users) ? row.users[0] : row.users;
      return {
        id: row.id,
        business_name: row.business_name,
        owner_name: userRow?.full_name ?? null,
        owner_email: userRow?.email ?? null,
        phone: row.phone,
        status: row.status,
      };
    });

    if (usersError) {
      console.error("Error searching users:", usersError);
    }
    if (bookingsError) {
      console.error("Error searching bookings:", bookingsError);
    }
    if (providersError) {
      console.error("Error searching providers:", providersError);
    }

    return NextResponse.json({
      data: {
        users: users || [],
        bookings: bookings || [],
        providers: providers || [],
      },
      error: null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to search");
  }
}
