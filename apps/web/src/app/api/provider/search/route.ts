import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { getTenantLocaleTagFromRegionConfig } from "@/lib/locale/tenant-locale";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import {
  buildIlikeOrClause,
  expandSearchTokens,
  fuzzyTextRelevanceScore,
} from "@/lib/search/fuzzy-rank";
import {
  findCustomerIdsByContactSearchAmongIds,
  loadDistinctBookingCustomerIdsForProvider,
  loadProviderClientIndexRows,
} from "@/lib/provider/client-contact-search";
import { fetchInIdChunks, POSTGREST_IN_CHUNK } from "@/lib/provider-ops/postgrest-unbounded";

export interface ProviderSearchSuggestion {
  type: "client" | "appointment" | "service";
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  /** Present on appointment results — true when the booking is a group-booking participant. */
  is_group_booking?: boolean;
  /** Present on appointment results when is_group_booking is true. */
  group_booking_id?: string | null;
}

export interface ProviderSearchResult {
  suggestions: ProviderSearchSuggestion[];
}

/**
 * GET /api/provider/search
 *
 * Provider-scoped global search across clients, appointments, and services.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi([
      "provider_owner",
      "provider_staff",
      "superadmin",
    ], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = await getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return successResponse({ suggestions: [] });
    }

    const { data: provRow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const tenantId =
      (provRow as { tenant_id?: string | null } | null)?.tenant_id ??
      (await resolveTenantIdWithZaFallback(request));
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const intlLocale = getTenantLocaleTagFromRegionConfig(tenantRegion);
    const searchCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const formatServicePrice = (amount: number) =>
      new Intl.NumberFormat(intlLocale, {
        style: "currency",
        currency: searchCurrency,
      }).format(amount);

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "10", 10),
      20
    );

    if (q.length < 1) {
      return successResponse({ suggestions: [] });
    }

    const tokens = expandSearchTokens(q);
    const suggestions: ProviderSearchSuggestion[] = [];

    // 1. Search clients (all saved provider_clients + users)
    const providerClientRows = await loadProviderClientIndexRows(supabaseAdmin, providerId);
    if (providerClientRows.length > 0) {
      const customerIds = providerClientRows.map((c) => c.customer_id);
      const clientMap = new Map(
        providerClientRows.map((c) => [c.customer_id, c.id ?? c.customer_id]),
      );
      const matchedCustomerIds = await findCustomerIdsByContactSearchAmongIds(
        supabaseAdmin,
        customerIds,
        q,
        tokens,
      );
      const customers = await fetchInIdChunks<{
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
      }>(matchedCustomerIds.slice(0, Math.min(limit * 3, 60)), (slice) =>
        supabaseAdmin.from("users").select("id, full_name, email, phone").in("id", slice)
      );

      for (const c of customers) {
        const providerClientId = clientMap.get(c.id);
        suggestions.push({
          type: "client",
          id: providerClientId || c.id,
          title: c.full_name || c.email || "Unknown",
          subtitle: c.email || c.phone || undefined,
          url: `/provider/clients/${providerClientId || c.id}`,
        });
      }
    }

    // 2. Search bookings (by booking_number or customer name)
    const BOOKING_SELECT = `
      id,
      booking_number,
      scheduled_start_at,
      status,
      customer_id,
      is_group_booking,
      group_booking_id,
      customers:users!bookings_customer_id_fkey(id, full_name, email)
    `;

    const pushBookingSuggestion = (b: Record<string, unknown>) => {
      const customer = b.customers as { full_name?: string; email?: string } | null;
      const customerName = customer?.full_name || customer?.email || "";
      const scheduledDate = b.scheduled_start_at
        ? new Date(b.scheduled_start_at as string).toLocaleDateString(intlLocale, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "";
      const isGroup = Boolean(b.is_group_booking);
      const groupId = (b.group_booking_id as string | null) ?? null;
      suggestions.push({
        type: "appointment",
        id: b.id as string,
        title: (b.booking_number as string) || "Booking",
        subtitle: customerName ? `${customerName} · ${scheduledDate}` : scheduledDate,
        url: `/provider/bookings/${b.id as string}`,
        ...(isGroup ? { is_group_booking: true, group_booking_id: groupId } : {}),
      });
    };

    const bookingOr =
      tokens.length > 0
        ? tokens.map((tok) => `booking_number.ilike.%${tok}%`).join(",")
        : "";
    const { data: bookings } = bookingOr
      ? await supabaseAdmin
          .from("bookings")
          .select(BOOKING_SELECT)
          .eq("provider_id", providerId)
          .or(bookingOr)
          .order("scheduled_start_at", { ascending: false })
          .limit(Math.min(limit * 2, 40))
      : { data: null as null };

    if (bookings) {
      for (const b of bookings) pushBookingSuggestion(b as unknown as Record<string, unknown>);
    }

    // If we didn't find bookings by number, try by customer name / email / phone (scoped)
    if (bookings?.length === 0) {
      const bookingCustomerIds = await loadDistinctBookingCustomerIdsForProvider(
        supabaseAdmin,
        providerId,
      );
      const customerIds = await findCustomerIdsByContactSearchAmongIds(
        supabaseAdmin,
        bookingCustomerIds,
        q,
        tokens,
      );

      if (customerIds.length > 0) {
        const { data: customerBookings } = await supabaseAdmin
          .from("bookings")
          .select(BOOKING_SELECT)
          .eq("provider_id", providerId)
          .in("customer_id", customerIds.slice(0, POSTGREST_IN_CHUNK))
          .order("scheduled_start_at", { ascending: false })
          .limit(limit);

        if (customerBookings) {
          for (const b of customerBookings) pushBookingSuggestion(b as unknown as Record<string, unknown>);
        }
      }
    }

    // 3. Search services (offerings)
    const serviceOr = buildIlikeOrClause(["title", "description"], tokens);
    const { data: services } = serviceOr
      ? await supabaseAdmin
          .from("offerings")
          .select("id, title, description, price, duration_minutes")
          .eq("provider_id", providerId)
          .eq("is_active", true)
          .or(serviceOr)
          .limit(Math.min(limit * 2, 40))
      : { data: null as null };

    if (services) {
      for (const s of services) {
        const priceStr = (s as any).price
          ? formatServicePrice(Number((s as any).price))
          : "";
        const durationStr = (s as any).duration_minutes
          ? `${(s as any).duration_minutes} min`
          : "";
        const subtitle = [priceStr, durationStr].filter(Boolean).join(" · ");
        suggestions.push({
          type: "service",
          id: (s as any).id,
          title: (s as any).title,
          subtitle: subtitle || undefined,
          url: `/provider/catalogue/services?service=${(s as any).id}`,
        });
      }
    }

    // Deduplicate by id+type and limit total
    const seen = new Set<string>();
    const unique = suggestions.filter((s) => {
      const key = `${s.type}:${s.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    unique.sort((a, b) => {
      const sa = fuzzyTextRelevanceScore(q, a.title, a.subtitle ?? "");
      const sb = fuzzyTextRelevanceScore(q, b.title, b.subtitle ?? "");
      if (sb !== sa) return sb - sa;
      return a.title.localeCompare(b.title);
    });

    return successResponse({
      suggestions: unique.slice(0, limit),
    });
  } catch (error) {
    return handleApiError(error, "Failed to search");
  }
}
