import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";

export type AdminSearchUser = {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  role: string | null;
};

export type AdminSearchBooking = {
  id: string;
  booking_number: string;
  customer_id: string | null;
  provider_id: string | null;
  status: string | null;
  created_at: string | null;
  customer_name: string | null;
  customer_email: string | null;
  provider_name: string | null;
};

export type AdminSearchProvider = {
  id: string;
  business_name: string | null;
  owner_name: string | null;
  owner_email: string | null;
  phone: string | null;
  status: string | null;
};

export type AdminGlobalSearchResults = {
  users: AdminSearchUser[];
  bookings: AdminSearchBooking[];
  providers: AdminSearchProvider[];
};

const EMPTY: AdminGlobalSearchResults = { users: [], bookings: [], providers: [] };

export type AdminSearchKind = "user" | "booking" | "provider";

/**
 * Tenant-scoped admin global search (same logic as GET /api/admin/search core buckets).
 */
export async function runAdminGlobalSearch(
  admin: SupabaseClient,
  tenantId: string,
  query: string,
  kinds?: AdminSearchKind[],
): Promise<AdminGlobalSearchResults> {
  const searchTerm = query.trim();
  if (searchTerm.length < 2) return EMPTY;

  const rpcResults = await runFuzzySearchRpc(admin, tenantId, searchTerm);
  const base = rpcResults ?? (await runLegacySearch(admin, tenantId, searchTerm));

  const filterKinds = kinds?.length ? new Set(kinds) : null;
  return {
    users: !filterKinds || filterKinds.has("user") ? base.users : [],
    bookings: !filterKinds || filterKinds.has("booking") ? base.bookings : [],
    providers: !filterKinds || filterKinds.has("provider") ? base.providers : [],
  };
}

async function runFuzzySearchRpc(
  admin: SupabaseClient,
  tenantId: string,
  searchTerm: string,
): Promise<AdminGlobalSearchResults | null> {
  const { data, error } = await admin.rpc("admin_global_search", {
    p_tenant_id: tenantId,
    p_query: searchTerm,
    p_limit: 5,
  });
  if (error) return null;

  const box = (data ?? {}) as {
    users?: unknown[];
    bookings?: unknown[];
    providers?: unknown[];
  };

  const users: AdminSearchUser[] = (box.users ?? []).map(mapUser);
  const providers: AdminSearchProvider[] = (box.providers ?? []).map(mapProvider);
  const bookings: AdminSearchBooking[] = (box.bookings ?? []).map(mapBooking);
  return { users, providers, bookings };
}

async function runLegacySearch(
  admin: SupabaseClient,
  tenantId: string,
  searchTerm: string,
): Promise<AdminGlobalSearchResults> {
  const term = searchTerm.toLowerCase();

  const { data: userSearchPayload } = await admin.rpc("admin_users_list_for_tenant", {
    p_tenant_id: tenantId,
    p_limit: 5,
    p_offset: 0,
    p_search: term,
    p_role: null,
    p_signup_source: null,
  });

  const userBox = userSearchPayload as { data?: unknown[] } | null;
  const users: AdminSearchUser[] = (userBox?.data ?? []).map(mapUser);

  let bookingIds: string[] = [];
  const { data: bookingsByNumber } = await admin
    .from("bookings")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("booking_number", `%${term}%`)
    .limit(5);
  bookingIds = (bookingsByNumber || []).map((b: { id: string }) => b.id);

  if (bookingIds.length < 5) {
    const matchedUserIds = users.map((u) => u.id);
    if (matchedUserIds.length > 0) {
      const { data: bookingsByUser } = await admin
        .from("bookings")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("customer_id", matchedUserIds)
        .order("created_at", { ascending: false })
        .limit(5 - bookingIds.length);
      for (const b of bookingsByUser || []) {
        const id = (b as { id: string }).id;
        if (!bookingIds.includes(id)) bookingIds.push(id);
      }
    }
  }

  let bookings: AdminSearchBooking[] = [];
  if (bookingIds.length > 0) {
    const { data: bookingRows } = await admin
      .from("bookings")
      .select("id, booking_number, customer_id, provider_id, status, created_at")
      .in("id", bookingIds)
      .order("created_at", { ascending: false });

    const custIds = [
      ...new Set((bookingRows || []).map((b: { customer_id: string }) => b.customer_id).filter(Boolean)),
    ];
    const provIds = [
      ...new Set((bookingRows || []).map((b: { provider_id: string | null }) => b.provider_id).filter(Boolean)),
    ] as string[];

    const custMap = new Map<string, { full_name: string | null; email: string }>();
    const provMap = new Map<string, string>();

    if (custIds.length > 0) {
      const { data: custRows } = await admin.from("users").select("id, full_name, email").in("id", custIds);
      for (const c of custRows || []) custMap.set(c.id, c as { full_name: string | null; email: string });
    }
    if (provIds.length > 0) {
      const { data: provRows } = await admin.from("providers").select("id, business_name").in("id", provIds);
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

  let ownerMatchedProviderIds: string[] = [];
  {
    const { data: ownerRows } = await admin
      .from("users")
      .select("id, full_name, email")
      .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
      .limit(25);
    const ownerIds = (ownerRows || []).map((u) => (u as { id: string }).id);
    if (ownerIds.length > 0) {
      const { data: provOwnerRows } = await admin
        .from("providers")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("user_id", ownerIds);
      ownerMatchedProviderIds = (provOwnerRows || []).map((p) => (p as { id: string }).id);
    }
  }

  const providerOrClauses = [`business_name.ilike.%${term}%`, `phone.ilike.%${term}%`];
  if (ownerMatchedProviderIds.length > 0) {
    providerOrClauses.push(`id.in.(${ownerMatchedProviderIds.join(",")})`);
  }

  const { data: providersRaw } = await admin
    .from("providers")
    .select("id, business_name, phone, status, user_id, users:user_id(full_name, email)")
    .eq("tenant_id", tenantId)
    .or(providerOrClauses.join(","))
    .limit(5);

  const providers: AdminSearchProvider[] = (providersRaw || []).map((p) => {
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
      business_name: row.business_name ?? null,
      owner_name: userRow?.full_name ?? null,
      owner_email: userRow?.email ?? null,
      phone: row.phone ?? null,
      status: row.status ?? null,
    };
  });

  return { users, bookings, providers };
}

function mapUser(raw: unknown): AdminSearchUser {
  const u = raw as Record<string, unknown>;
  return {
    id: String(u.id ?? ""),
    email: u.email != null ? String(u.email) : null,
    phone: u.phone != null ? String(u.phone) : null,
    full_name: u.full_name != null ? String(u.full_name) : null,
    role: u.role != null ? String(u.role) : null,
  };
}

function mapProvider(raw: unknown): AdminSearchProvider {
  const p = raw as Record<string, unknown>;
  return {
    id: String(p.id ?? ""),
    business_name: p.business_name != null ? String(p.business_name) : null,
    owner_name: p.owner_name != null ? String(p.owner_name) : null,
    owner_email: p.owner_email != null ? String(p.owner_email) : null,
    phone: p.phone != null ? String(p.phone) : null,
    status: p.status != null ? String(p.status) : null,
  };
}

function mapBooking(raw: unknown): AdminSearchBooking {
  const b = raw as Record<string, unknown>;
  return {
    id: String(b.id ?? ""),
    booking_number: b.booking_number != null ? String(b.booking_number) : "",
    customer_id: b.customer_id != null ? String(b.customer_id) : null,
    provider_id: b.provider_id != null ? String(b.provider_id) : null,
    status: b.status != null ? String(b.status) : null,
    created_at: b.created_at != null ? String(b.created_at) : null,
    customer_name: b.customer_name != null ? String(b.customer_name) : null,
    customer_email: b.customer_email != null ? String(b.customer_email) : null,
    provider_name: b.provider_name != null ? String(b.provider_name) : null,
  };
}

/** Used by search route for provider-ops extras — re-export helper for ops leads if needed. */
export { getUserRowIfAccessibleToAdminTenant };
