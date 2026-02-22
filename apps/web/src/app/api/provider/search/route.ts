import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";

export interface ProviderSearchSuggestion {
  type: "client" | "appointment" | "service";
  id: string;
  title: string;
  subtitle?: string;
  url: string;
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

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "10", 10),
      20
    );

    if (q.length < 2) {
      return successResponse({ suggestions: [] });
    }

    const searchTerm = `%${q.toLowerCase()}%`;
    const suggestions: ProviderSearchSuggestion[] = [];

    // 1. Search clients (provider_clients + users)
    const { data: providerClients } = await supabaseAdmin
      .from("provider_clients")
      .select("id, customer_id")
      .eq("provider_id", providerId)
      .limit(100);

    if (providerClients && providerClients.length > 0) {
      const customerIds = providerClients.map((c) => c.customer_id);
      const clientMap = new Map(
        providerClients.map((c) => [c.customer_id, c.id])
      );

      const { data: customers } = await supabaseAdmin
        .from("users")
        .select("id, full_name, email, phone")
        .in("id", customerIds)
        .or(
          `full_name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`
        )
        .limit(limit);

      if (customers) {
        for (const c of customers) {
          const providerClientId = clientMap.get(c.id);
          suggestions.push({
            type: "client",
            id: providerClientId || c.id,
            title: (c as any).full_name || (c as any).email || "Unknown",
            subtitle: (c as any).email || (c as any).phone,
            url: `/provider/clients?customerId=${(c as any).id}`,
          });
        }
      }
    }

    // 2. Search bookings (by booking_number or customer name)
    const { data: bookings } = await supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        booking_number,
        scheduled_start_at,
        status,
        customer_id,
        customers:users!bookings_customer_id_fkey(id, full_name, email)
      `
      )
      .eq("provider_id", providerId)
      .or(`booking_number.ilike.${searchTerm}`)
      .order("scheduled_start_at", { ascending: false })
      .limit(limit);

    if (bookings) {
      for (const b of bookings) {
        const customer = (b as any).customers;
        const customerName = customer?.full_name || customer?.email || "";
        const scheduledDate = (b as any).scheduled_start_at
          ? new Date((b as any).scheduled_start_at).toLocaleDateString(
              "en-ZA",
              {
                month: "short",
                day: "numeric",
                year: "numeric",
              }
            )
          : "";
        suggestions.push({
          type: "appointment",
          id: (b as any).id,
          title: (b as any).booking_number || `Booking`,
          subtitle: customerName
            ? `${customerName} · ${scheduledDate}`
            : scheduledDate,
          url: `/provider/calendar?date=${
            (b as any).scheduled_start_at?.split("T")[0] || ""
          }&appointment=${(b as any).id}`,
        });
      }
    }

    // If we didn't find bookings by number, try by customer name
    if (bookings?.length === 0) {
      const { data: matchingCustomers } = await supabaseAdmin
        .from("users")
        .select("id")
        .or(
          `full_name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`
        )
        .limit(5);

      if (matchingCustomers && matchingCustomers.length > 0) {
        const customerIds = matchingCustomers.map((c) => (c as any).id);
        const { data: customerBookings } = await supabaseAdmin
          .from("bookings")
          .select(
            `
            id,
            booking_number,
            scheduled_start_at,
            customers:users!bookings_customer_id_fkey(id, full_name, email)
          `
          )
          .eq("provider_id", providerId)
          .in("customer_id", customerIds)
          .order("scheduled_start_at", { ascending: false })
          .limit(limit);

        if (customerBookings) {
          for (const b of customerBookings) {
            const customer = (b as any).customers;
            const scheduledDate = (b as any).scheduled_start_at
              ? new Date((b as any).scheduled_start_at).toLocaleDateString(
                  "en-ZA",
                  {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }
                )
              : "";
            suggestions.push({
              type: "appointment",
              id: (b as any).id,
              title: (b as any).booking_number || `Booking`,
              subtitle: customer
                ? `${customer.full_name || customer.email} · ${scheduledDate}`
                : scheduledDate,
              url: `/provider/calendar?date=${
                (b as any).scheduled_start_at?.split("T")[0] || ""
              }&appointment=${(b as any).id}`,
            });
          }
        }
      }
    }

    // 3. Search services (offerings)
    const { data: services } = await supabaseAdmin
      .from("offerings")
      .select("id, title, description, price, duration_minutes")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`)
      .limit(limit);

    if (services) {
      for (const s of services) {
        const priceStr = (s as any).price
          ? `R${Number((s as any).price).toFixed(0)}`
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

    return successResponse({
      suggestions: unique.slice(0, limit),
    });
  } catch (error) {
    return handleApiError(error, "Failed to search");
  }
}
