import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";

/**
 * GET /api/admin/search
 *
 * Fuzzy global search across users, bookings and providers for the admin
 * top-bar search box. Primary path is the tenant-scoped `admin_global_search`
 * RPC (pg_trgm similarity + substring, ranked). If that RPC is unavailable
 * (e.g. an environment where migration 736 has not run yet) we fall back to the
 * legacy substring queries so search keeps working end to end.
 */

type UserResult = {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  role: string | null;
};

type BookingResult = {
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

type ProviderResult = {
  id: string;
  business_name: string | null;
  owner_name: string | null;
  owner_email: string | null;
  phone: string | null;
  status: string | null;
};

type LeadResult = {
  id: string;
  business_name: string | null;
  lead_name: string | null;
  email: string | null;
  phone_e164: string | null;
  commercial_stage: string | null;
};

type OnboardingDraftResult = {
  user_id: string;
  business_name: string | null;
  owner_name: string | null;
  owner_email: string | null;
  current_step: number | null;
};

type SearchResults = {
  users: UserResult[];
  bookings: BookingResult[];
  providers: ProviderResult[];
  leads: LeadResult[];
  onboarding_drafts: OnboardingDraftResult[];
};

const EMPTY_RESULTS: SearchResults = {
  users: [],
  bookings: [],
  providers: [],
  leads: [],
  onboarding_drafts: [],
};

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
      return NextResponse.json({ data: EMPTY_RESULTS, error: null });
    }

    const searchTerm = query.trim();
    const tenantId = await resolveAdminApiTenantId(request);
    const admin = getSupabaseAdmin();

    const rpcResults = await runFuzzySearchRpc(admin, tenantId, searchTerm);
    const base = rpcResults ?? (await runLegacySearch(supabase, admin, tenantId, searchTerm));
    const ops = await searchProviderOpsRecords(admin, tenantId, searchTerm);
    return NextResponse.json({
      data: {
        ...base,
        leads: ops.leads,
        onboarding_drafts: ops.onboarding_drafts,
      },
      error: null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to search");
  }
}

/** Primary path: single fuzzy, tenant-scoped RPC. Returns null so the caller can fall back. */
async function runFuzzySearchRpc(
  admin: SupabaseClient,
  tenantId: string,
  searchTerm: string
): Promise<SearchResults | null> {
  const { data, error } = await admin.rpc("admin_global_search", {
    p_tenant_id: tenantId,
    p_query: searchTerm,
    p_limit: 5,
  });

  if (error) {
    console.error("admin_global_search RPC failed, falling back to substring search:", error);
    return null;
  }

  const box = (data ?? {}) as {
    users?: unknown[];
    bookings?: unknown[];
    providers?: unknown[];
  };

  const users: UserResult[] = (box.users ?? []).map((raw) => {
    const u = raw as Record<string, unknown>;
    return {
      id: String(u.id ?? ""),
      email: u.email != null ? String(u.email) : null,
      phone: u.phone != null ? String(u.phone) : null,
      full_name: u.full_name != null ? String(u.full_name) : null,
      role: u.role != null ? String(u.role) : null,
    };
  });

  const providers: ProviderResult[] = (box.providers ?? []).map((raw) => {
    const p = raw as Record<string, unknown>;
    return {
      id: String(p.id ?? ""),
      business_name: p.business_name != null ? String(p.business_name) : null,
      owner_name: p.owner_name != null ? String(p.owner_name) : null,
      owner_email: p.owner_email != null ? String(p.owner_email) : null,
      phone: p.phone != null ? String(p.phone) : null,
      status: p.status != null ? String(p.status) : null,
    };
  });

  const bookings: BookingResult[] = (box.bookings ?? []).map((raw) => {
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
  });

  return { users, providers, bookings, leads: [], onboarding_drafts: [] };
}

/** Legacy substring fallback (no fuzzy) — used only when the RPC is unavailable. */
async function runLegacySearch(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  tenantId: string,
  searchTerm: string
): Promise<SearchResults> {
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
  const users: UserResult[] = (userBox?.data ?? []).map((raw) => {
    const u = raw as Record<string, unknown>;
    return {
      id: String(u.id ?? ""),
      email: u.email != null ? String(u.email) : null,
      phone: u.phone != null ? String(u.phone) : null,
      full_name: u.full_name != null ? String(u.full_name) : null,
      role: u.role != null ? String(u.role) : null,
    };
  });

  // Bookings — by booking number, then also via matched customers.
  let bookingIds: string[] = [];
  const { data: bookingsByNumber } = await supabase
    .from("bookings")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("booking_number", `%${term}%`)
    .limit(5);
  bookingIds = (bookingsByNumber || []).map((b: { id: string }) => b.id);

  if (bookingIds.length < 5) {
    const matchedUserIds = users.map((u) => u.id);
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

  let bookings: BookingResult[] = [];
  if (bookingIds.length > 0) {
    const { data: bookingRows } = await supabase
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

  // Providers — by business name / phone, plus owner name/email via users.
  let ownerMatchedProviderIds: string[] = [];
  {
    const { data: ownerRows } = await supabase
      .from("users")
      .select("id, full_name, email")
      .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
      .limit(25);
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

  const providerOrClauses = [`business_name.ilike.%${term}%`, `phone.ilike.%${term}%`];
  if (ownerMatchedProviderIds.length > 0) {
    providerOrClauses.push(`id.in.(${ownerMatchedProviderIds.join(",")})`);
  }

  const { data: providersRaw } = await supabase
    .from("providers")
    .select("id, business_name, phone, status, user_id, users:user_id(full_name, email)")
    .eq("tenant_id", tenantId)
    .or(providerOrClauses.join(","))
    .limit(5);

  const providers: ProviderResult[] = (providersRaw || []).map((p) => {
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

  return { users, bookings, providers, leads: [], onboarding_drafts: [] };
}

/** Provider Ops leads and in-progress onboarding drafts (substring match). */
async function searchProviderOpsRecords(
  admin: SupabaseClient,
  tenantId: string,
  searchTerm: string,
): Promise<{ leads: LeadResult[]; onboarding_drafts: OnboardingDraftResult[] }> {
  const term = searchTerm.toLowerCase();

  const { data: leadRows } = await admin
    .from("provider_leads")
    .select("id, business_name, lead_name, email, phone_e164, commercial_stage")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .or(
      [
        `business_name.ilike.%${term}%`,
        `lead_name.ilike.%${term}%`,
        `email.ilike.%${term}%`,
        `phone_e164.ilike.%${term}%`,
        `contact_person_name.ilike.%${term}%`,
      ].join(","),
    )
    .limit(5);

  const leads: LeadResult[] = (leadRows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id ?? ""),
      business_name: r.business_name != null ? String(r.business_name) : null,
      lead_name: r.lead_name != null ? String(r.lead_name) : null,
      email: r.email != null ? String(r.email) : null,
      phone_e164: r.phone_e164 != null ? String(r.phone_e164) : null,
      commercial_stage: r.commercial_stage != null ? String(r.commercial_stage) : null,
    };
  });

  const { data: draftRows } = await admin
    .from("provider_onboarding_drafts")
    .select("user_id, current_step, draft_data, updated_at")
    .order("updated_at", { ascending: false })
    .limit(40);

  const onboarding_drafts: OnboardingDraftResult[] = [];
  for (const raw of draftRows ?? []) {
    const row = raw as {
      user_id: string;
      current_step?: number | null;
      draft_data?: Record<string, unknown> | null;
    };
    const draftData = row.draft_data ?? {};
    const businessName = draftData.business_name != null ? String(draftData.business_name) : "";
    const ownerName = draftData.owner_name != null ? String(draftData.owner_name) : "";
    const ownerEmail = draftData.owner_email != null ? String(draftData.owner_email) : "";
    const haystack = [businessName, ownerName, ownerEmail, row.user_id].join(" ").toLowerCase();
    if (!haystack.includes(term)) continue;

    const userRow = await getUserRowIfAccessibleToAdminTenant(admin, tenantId, row.user_id);
    if (!userRow) continue;

    onboarding_drafts.push({
      user_id: row.user_id,
      business_name: businessName || null,
      owner_name: ownerName || (userRow.full_name != null ? String(userRow.full_name) : null),
      owner_email: ownerEmail || (userRow.email != null ? String(userRow.email) : null),
      current_step: row.current_step ?? null,
    });
    if (onboarding_drafts.length >= 5) break;
  }

  return { leads, onboarding_drafts };
}
