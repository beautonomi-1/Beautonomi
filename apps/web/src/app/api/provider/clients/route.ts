import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
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
import { requirePermission } from "@/lib/auth/requirePermission";
import { hasProviderCustomerRelationship } from "@/lib/provider/client-access";
import { buildSalonMembershipMap } from "@/lib/provider/attach-salon-membership-to-clients";
import {
  findProviderSavedClientMatches,
  findServicedOnlyCustomerIdsBySearch,
} from "@/lib/provider/client-contact-search";
import { fetchInIdChunks } from "@/lib/provider-ops/postgrest-unbounded";

const PROVIDER_CLIENT_COLUMNS =
  "id, notes, tags, is_favorite, last_service_date, total_bookings, total_spent, created_at, customer_id, relationship_source, privacy_level, source_metadata, linked_existing_platform_user";

const CLIENT_USER_COLUMNS =
  "id, full_name, email, phone, avatar_url, identity_verified, identity_verification_status, rating_average, review_count, customer_review_rating_avg, customer_review_rating_count, customer_booking_rating_avg, customer_booking_rating_count, date_of_birth, email_notifications_enabled, sms_notifications_enabled";

function computeIsRegistered(email: string | null | undefined): boolean {
  if (!email) return false;
  if (email.includes("beautonomi.invalid")) return false;
  if (email.includes("beautonomi.local")) return false;
  return true;
}

/** Same ordering as the unsearched list: favourites first, then most recent service (nulls last). */
function compareSavedClients(
  a: { is_favorite?: boolean | null; last_service_date?: string | null },
  b: { is_favorite?: boolean | null; last_service_date?: string | null },
): number {
  const fav = Number(Boolean(b.is_favorite)) - Number(Boolean(a.is_favorite));
  if (fav !== 0) return fav;
  const ad = a.last_service_date ?? null;
  const bd = b.last_service_date ?? null;
  if (ad === bd) return 0;
  if (ad === null) return 1;
  if (bd === null) return -1;
  return ad < bd ? 1 : -1;
}

function redactLimitedLinkedCustomer(
  client: {
    relationship_source?: string | null;
    privacy_level?: string | null;
    source_metadata?: unknown;
    total_bookings?: number | null;
  },
  customer: Record<string, any>,
) {
  const hasServiceHistory = Number(client.total_bookings ?? 0) > 0;
  if (
    client.relationship_source !== "manual_existing_platform" ||
    client.privacy_level !== "limited" ||
    hasServiceHistory
  ) {
    return customer;
  }

  const metadata =
    client.source_metadata && typeof client.source_metadata === "object"
      ? (client.source_metadata as Record<string, unknown>)
      : {};

  return {
    id: customer.id,
    full_name: metadata.provider_supplied_name || customer.full_name || "Existing Beautonomi customer",
    email: metadata.matched_on === "email" ? customer.email : metadata.provider_supplied_email ?? null,
    phone: metadata.matched_on === "phone" ? customer.phone : metadata.provider_supplied_phone ?? null,
    avatar_url: null,
    rating_average: null,
    review_count: 0,
    customer_review_rating_avg: null,
    customer_review_rating_count: null,
    customer_booking_rating_avg: null,
    customer_booking_rating_count: null,
    date_of_birth: null,
    email_notifications_enabled: null,
    sms_notifications_enabled: null,
    is_registered: true,
    is_limited_platform_link: true,
  };
}

/** Serviced customer who has no `provider_clients` row yet (shape matches a saved row). */
function syntheticServicedClientRow(customerId: string) {
  return {
    id: customerId,
    customer_id: customerId,
    notes: null,
    tags: null,
    is_favorite: false,
    last_service_date: null,
    total_bookings: null,
    total_spent: null,
    created_at: null,
    relationship_source: null,
    privacy_level: "standard",
    source_metadata: null,
    linked_existing_platform_user: false,
  };
}

/**
 * Attach `customer` (redacted for limited links), `salon_membership`, and
 * `customer.default_address` to provider client rows.
 */
async function enrichClientRows(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  providerId: string,
  rows: Record<string, any>[],
): Promise<any[]> {
  if (rows.length === 0) return [];
  const customerIds = [...new Set(rows.map((r) => String(r.customer_id)))];

  const customers = await fetchInIdChunks<Record<string, any>>(
    customerIds,
    (slice) => supabaseAdmin.from("users").select(CLIENT_USER_COLUMNS).in("id", slice),
    { throwOnError: true },
  );
  const customerById = new Map(customers.map((c) => [String(c.id), c]));

  if (customers.length < customerIds.length) {
    const missingIds = customerIds.filter((id) => !customerById.has(id));
    if (missingIds.length > 0) {
      console.warn(`⚠️ ${missingIds.length} customer IDs in provider_clients but not found in users table:`, missingIds);
    }
  }

  const membershipByUserId = await buildSalonMembershipMap(providerId, customerIds, supabaseAdmin);
  const defaultAddrByUser = await fetchDefaultAddressesForUsers(supabaseAdmin, customerIds);

  // §Provider-audit 2026-04: tag each customer with `is_registered` so the
  // mobile app can disable messaging / custom offer CTAs for walk-in
  // placeholders (walkin+xxx@beautonomi.invalid or @beautonomi.local).
  return rows.map((client) => {
    const cid = String(client.customer_id);
    const customer = customerById.get(cid);
    const default_address = defaultAddrByUser.get(cid) ?? null;
    const salon_membership = membershipByUserId.get(cid) ?? null;

    if (!customer) {
      return {
        ...client,
        salon_membership,
        customer: {
          id: cid,
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
          default_address,
        },
      };
    }

    return {
      ...client,
      salon_membership,
      customer: {
        ...redactLimitedLinkedCustomer(client, {
          ...customer,
          is_registered: computeIsRegistered(customer.email),
        }),
        default_address,
      },
    };
  });
}

/**
 * GET /api/provider/clients
 * Get all saved clients for the provider.
 *
 * - `search`: provider-scoped match on name, email, phone (national `0…` or
 *   `+27…`), provider-typed contact on limited links, notes and tags.
 * - `include_serviced=1` (with `search`): also return customers who booked
 *   (not cancelled / no-show) but were never saved, after the saved matches.
 * - `customer_id`: return just that client (saved or serviced) for preselect.
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("view_clients", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const trimmedSearch = searchParams.get("search")?.trim() ?? "";
    const customerIdParam = searchParams.get("customer_id")?.trim() || null;
    const includeServiced =
      searchParams.get("include_serviced") === "1" ||
      searchParams.get("include_serviced") === "true";
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

    const supabaseAdmin = getSupabaseAdmin();

    if (customerIdParam) {
      return await buildPreselectedClientResponse(
        supabase,
        supabaseAdmin,
        providerId,
        customerIdParam,
      );
    }

    let pageRows: Record<string, any>[];
    let totalCount: number;

    if (trimmedSearch) {
      const { matchedCustomerIds, savedRows } = await findProviderSavedClientMatches(
        supabaseAdmin,
        providerId,
        trimmedSearch,
      );

      const servicedOnlyIds = includeServiced
        ? await findServicedOnlyCustomerIdsBySearch(
            supabaseAdmin,
            providerId,
            trimmedSearch,
            new Set(savedRows.map((r) => r.customer_id)),
          )
        : [];

      const savedMatches =
        matchedCustomerIds.size > 0
          ? await fetchInIdChunks<Record<string, any>>(
              [...matchedCustomerIds],
              (slice) =>
                supabase
                  .from("provider_clients")
                  .select(PROVIDER_CLIENT_COLUMNS)
                  .eq("provider_id", providerId)
                  .in("customer_id", slice),
              { throwOnError: true },
            )
          : [];
      savedMatches.sort(compareSavedClients);

      // Saved matches first, then serviced-only, paginated as one list.
      totalCount = savedMatches.length + servicedOnlyIds.length;
      const savedPage = savedMatches.slice(pageOffset, pageOffset + pageLimit);
      const servicedStart = Math.max(0, pageOffset - savedMatches.length);
      const servicedPage = servicedOnlyIds
        .slice(servicedStart, servicedStart + (pageLimit - savedPage.length))
        .map(syntheticServicedClientRow);
      pageRows = [...savedPage, ...servicedPage];
    } else {
      const { data: clients, error, count } = await supabase
        .from("provider_clients")
        .select(PROVIDER_CLIENT_COLUMNS, { count: "exact" })
        .eq("provider_id", providerId)
        .order("is_favorite", { ascending: false })
        .order("last_service_date", { ascending: false, nullsFirst: false })
        .range(pageOffset, pageOffset + pageLimit - 1);

      if (error) {
        throw error;
      }
      pageRows = clients ?? [];
      totalCount = count ?? pageRows.length;
    }

    const clientsWithCustomers = await enrichClientRows(supabaseAdmin, providerId, pageRows);

    const resp = successResponse(clientsWithCustomers);
    resp.headers.set("X-Total-Count", String(totalCount));
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
    const permissionCheck = await requirePermission("edit_clients", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
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
          relationship_source: "manual",
          privacy_level: "standard",
          source_metadata: { linked_via: "provider_clients_post" },
          created_by_user_id: user.id,
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

    const isKnownClient = await hasProviderCustomerRelationship(
      supabaseAdmin,
      providerId,
      customer_id,
    );
    if (!isKnownClient) {
      return errorResponse(
        "This customer is not yet connected to your business. Create a new client from their details, or ask the customer to book or message your business first.",
        "CLIENT_NOT_CONNECTED_TO_PROVIDER",
        403,
      );
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
        relationship_source: "manual",
        privacy_level: "standard",
        source_metadata: { linked_via: "provider_clients_post" },
        linked_existing_platform_user: false,
        created_by_user_id: user.id,
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

/** `GET ?customer_id=` — the saved row, or a serviced-only row, or `[]`. */
async function buildPreselectedClientResponse(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  providerId: string,
  customerId: string,
) {
  const { data: clientRow } = await supabase
    .from("provider_clients")
    .select(PROVIDER_CLIENT_COLUMNS)
    .eq("provider_id", providerId)
    .eq("customer_id", customerId)
    .maybeSingle();

  let row: Record<string, any> | null = clientRow;
  if (!row) {
    const { data: servicedHit } = await supabaseAdmin
      .from("bookings")
      .select("customer_id")
      .eq("provider_id", providerId)
      .eq("customer_id", customerId)
      .not("status", "in", '("cancelled","no_show")')
      .limit(1)
      .maybeSingle();
    if (servicedHit) row = syntheticServicedClientRow(customerId);
  }

  const payload = row ? await enrichClientRows(supabaseAdmin, providerId, [row]) : [];
  const resp = successResponse(payload);
  resp.headers.set("X-Total-Count", String(payload.length));
  return resp;
}
