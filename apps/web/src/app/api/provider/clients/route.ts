import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import {
  fetchDefaultAddressesForUsers,
  parseAddressFromBody,
  upsertCustomerDefaultAddress,
  CustomerHomeAddressLockedError,
} from "@/lib/provider-portal/user-default-address";

/**
 * GET /api/provider/clients
 * Get all saved clients for the provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("location_id");
    const searchQuery = searchParams.get("search");
    // §Provider-audit 2026-04 (round 3): add bounded pagination so
    // providers with 500+ clients don't hit the implicit PostgREST page
    // cap before search runs. Defaults preserve the previous behaviour
    // (1000-row ceiling). Callers can pass `limit=50&offset=100` for
    // infinite-scroll, and the server exposes `X-Total-Count`.
    const rawLimit = Number(searchParams.get("limit") ?? NaN);
    const rawOffset = Number(searchParams.get("offset") ?? NaN);
    const pageLimit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.max(Math.floor(rawLimit), 1), 200)
      : 1000;
    const pageOffset = Number.isFinite(rawOffset) && rawOffset >= 0
      ? Math.floor(rawOffset)
      : 0;
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider account required", 403);
    }

    const supabaseAdminForSearch = getSupabaseAdmin();

    // §Provider-audit 2026-04 (round 3): push the search predicate down
    // to SQL when a query is supplied. Previously we fetched the whole
    // provider_clients set, enriched with users, then filtered in JS —
    // which silently missed matches beyond the row cap. For a search we
    // now look up users first (name/email/phone), then restrict
    // provider_clients by that customer_id set.
    let customerIdAllowList: Set<string> | null = null;
    if (searchQuery && searchQuery.trim().length > 0) {
      const trimmed = searchQuery.trim();
      const digitsOnly = trimmed.replace(/\D+/g, "");
      // Sanitise: strip PostgREST .or() reserved chars so a rogue comma
      // or paren in the query can't break clause parsing.
      const safe = trimmed.replace(/[%_,()]/g, "");
      const orClauses: string[] = [
        `full_name.ilike.%${safe}%`,
        `email.ilike.%${safe}%`,
      ];
      if (digitsOnly.length > 0) {
        orClauses.push(`phone.ilike.%${digitsOnly}%`);
      }
      const { data: matchedUsers, error: searchErr } = await supabaseAdminForSearch
        .from("users")
        .select("id")
        .or(orClauses.join(","))
        .limit(500);
      if (searchErr) {
        console.error("[provider/clients] user search failed:", searchErr);
      }
      customerIdAllowList = new Set(
        (matchedUsers ?? []).map((u: { id: string }) => u.id).filter(Boolean),
      );
      // Short-circuit: no matches → empty result without the heavier enrichment.
      if (customerIdAllowList.size === 0) {
        const resp = successResponse([]);
        resp.headers.set("X-Total-Count", "0");
        return resp;
      }
    }

    let clientsQuery = supabase
      .from("provider_clients")
      .select(
        "id, notes, tags, is_favorite, last_service_date, total_bookings, total_spent, created_at, customer_id",
        { count: "exact" },
      )
      .eq("provider_id", providerId);

    if (customerIdAllowList) {
      clientsQuery = clientsQuery.in("customer_id", Array.from(customerIdAllowList));
    }

    // If location_id is provided (and no search), also fetch customer IDs with bookings at that location
    // We still show ALL saved clients but can mark which ones have location-specific bookings
    let _locationCustomerIds: Set<string> | null = null;
    if (locationId && !searchQuery) {
      const { data: locationBookings } = await supabase
        .from("bookings")
        .select("customer_id")
        .eq("provider_id", providerId)
        .or(`location_id.eq.${locationId},location_id.is.null`);
      
      _locationCustomerIds = new Set((locationBookings || []).map((b: { customer_id: string }) => b.customer_id));
    }

    const { data: clients, error, count: totalCount } = await clientsQuery
      .order("is_favorite", { ascending: false })
      .order("last_service_date", { ascending: false, nullsFirst: false })
      .range(pageOffset, pageOffset + pageLimit - 1);

    if (error) {
      throw error;
    }

    if (!clients || clients.length === 0) {
      const empty = successResponse([]);
      empty.headers.set("X-Total-Count", String(totalCount ?? 0));
      return empty;
    }

    // Fetch customer details using admin client to bypass RLS
    const customerIds = clients.map((c) => c.customer_id);
    const supabaseAdmin = supabaseAdminForSearch;
    const { data: customers, error: customersError } = await supabaseAdmin
      .from("users")
      .select(
        "id, full_name, email, phone, avatar_url, rating_average, review_count, customer_review_rating_avg, customer_review_rating_count, customer_booking_rating_avg, customer_booking_rating_count, date_of_birth, email_notifications_enabled, sms_notifications_enabled",
      )
      .in("id", customerIds);

    if (customersError) {
      console.error("Error fetching customer data from users table (admin client):", customersError);
      throw customersError;
    }
    
    // Log missing customers for debugging
    if (customers && customers.length < customerIds.length) {
      const foundIds = new Set(customers.map((c: { id: string }) => c.id));
      const missingIds = customerIds.filter(id => !foundIds.has(id));
      if (missingIds.length > 0) {
        console.warn(`⚠️ ${missingIds.length} customer IDs in provider_clients but not found in users table:`, missingIds);
      }
    }

    // Combine data - include all clients even if customer data is missing.
    // §Provider-audit 2026-04: tag each customer with `is_registered` so the
    // mobile app can disable messaging / custom offer CTAs for walk-in
    // placeholders (walkin+xxx@beautonomi.invalid or @beautonomi.local).
    // Previously the mobile Message button blindly POSTed to
    // /api/provider/conversations/create and we surfaced the raw
    // 404 "Customer not found" alert.
    const _foundCustomerIds = new Set(customers?.map((c: { id: string }) => c.id) || []);
    const computeIsRegistered = (email: string | null | undefined): boolean => {
      if (!email) return false;
      if (email.includes("beautonomi.invalid")) return false;
      if (email.includes("beautonomi.local")) return false;
      return true;
    };
    let clientsWithCustomers = clients.map((client) => {
      const customer = customers?.find((c) => c.id === client.customer_id);

      // If customer not found, create minimal customer object.
      if (!customer) {
        return {
          ...client,
          customer: {
            id: client.customer_id,
            full_name: null,
            email: null,
            phone: null,
            avatar_url: null,
            rating_average: null,
            review_count: 0,
            customer_review_rating_avg: null,
            customer_review_rating_count: null,
            customer_booking_rating_avg: null,
            customer_booking_rating_count: null,
            is_registered: false,
          },
        };
      }

      return {
        ...client,
        customer: {
          ...customer,
          is_registered: computeIsRegistered(customer.email),
        },
      };
    });

    const customerIdsForAddr = [
      ...new Set(
        clientsWithCustomers
          .map((c) => c.customer?.id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    const defaultAddrByUser = await fetchDefaultAddressesForUsers(
      supabaseAdmin,
      customerIdsForAddr,
    );
    clientsWithCustomers = clientsWithCustomers.map((row) => {
      const cid = row.customer?.id;
      const default_address = cid ? defaultAddrByUser.get(cid) ?? null : null;
      return {
        ...row,
        customer: row.customer ? { ...row.customer, default_address } : row.customer,
      };
    });

    // §Provider-audit 2026-04 (round 3): search predicate is now enforced
    // server-side via the `users` pre-query (see `customerIdAllowList`
    // above). Address-blob match remains as a local refinement when
    // needed, but we don't want it to hide otherwise-valid matches.
    if (searchQuery && searchQuery.trim().length > 0) {
      const searchLower = searchQuery.toLowerCase().trim();
      const refined = clientsWithCustomers.filter((client) => {
        const customer = client.customer;
        if (!customer) return false;
        const da = (customer as { default_address?: { address_line1?: string; city?: string } | null })
          .default_address;
        const addrBlob = [da?.address_line1, da?.city].filter(Boolean).join(" ").toLowerCase();
        const nameMatch = customer.full_name?.toLowerCase().includes(searchLower);
        const emailMatch = customer.email?.toLowerCase().includes(searchLower);
        const phoneDigits = customer.phone?.replace(/\D+/g, "") ?? "";
        const queryDigits = searchLower.replace(/\D+/g, "");
        const phoneMatch =
          customer.phone?.toLowerCase().includes(searchLower) ||
          (queryDigits.length >= 3 && phoneDigits.includes(queryDigits));
        const addrMatch = addrBlob.includes(searchLower);
        return Boolean(nameMatch || emailMatch || phoneMatch || addrMatch);
      });
      // If the address-blob refinement happened to filter everything out,
      // fall back to the SQL match set so users still get something useful.
      if (refined.length > 0) {
        clientsWithCustomers = refined;
      }
    }

    const resp = successResponse(clientsWithCustomers);
    resp.headers.set("X-Total-Count", String(totalCount ?? clientsWithCustomers.length));
    resp.headers.set("X-Page-Limit", String(pageLimit));
    resp.headers.set("X-Page-Offset", String(pageOffset));
    return resp;
  } catch (error) {
    return handleApiError(error, "Failed to load clients");
  }
}

/**
 * POST /api/provider/clients
 * Save a new client
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider account required", 403);
    }

    const body = await request.json();
    const { customer_id, notes, tags, is_favorite } = body;

    if (!customer_id) {
      return handleApiError(new Error("customer_id is required"), "Validation error", 400);
    }

    const supabaseAdmin = await getSupabaseAdmin();
    const addressPayload = parseAddressFromBody(body);

    // Check if client already exists
    const { data: existing } = await supabase
      .from("provider_clients")
      .select("id")
      .eq("provider_id", providerId)
      .eq("customer_id", customer_id)
      .single();

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from("provider_clients")
        .update({
          notes: notes || null,
          tags: tags && tags.length > 0 ? tags : null,
          is_favorite: is_favorite || false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;

      if (addressPayload) {
        try {
          await upsertCustomerDefaultAddress(supabaseAdmin, customer_id, addressPayload);
        } catch (e) {
          if (e instanceof CustomerHomeAddressLockedError) {
            return errorResponse(e.message, e.code, 403);
          }
          console.error("POST /provider/clients: address upsert failed", e);
          return handleApiError(
            e instanceof Error ? e : new Error("Failed to save address"),
            "Failed to save client address",
            400,
          );
        }
      }

      return successResponse(data);
    }

    // Create new
    const { data, error } = await supabase
      .from("provider_clients")
      .insert({
        provider_id: providerId,
        customer_id,
        notes: notes || null,
        tags: tags && tags.length > 0 ? tags : null,
        is_favorite: is_favorite || false,
      })
      .select()
      .single();

    if (error) throw error;

    if (addressPayload) {
      try {
        await upsertCustomerDefaultAddress(supabaseAdmin, customer_id, addressPayload);
      } catch (e) {
        if (e instanceof CustomerHomeAddressLockedError) {
          return errorResponse(e.message, e.code, 403);
        }
        console.error("POST /provider/clients: address upsert failed", e);
        return handleApiError(
          e instanceof Error ? e : new Error("Failed to save address"),
          "Failed to save client address",
          400,
        );
      }
    }

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to save client");
  }
}
