import { phoneMatchesQuery, phoneSearchNeedles } from "@beautonomi/phone";
import { fetchAllPaged, fetchInIdChunks } from "@/lib/provider-ops/postgrest-unbounded";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Provider-scoped contact search. Phone needles can be as short as 3 digits
 * (`0821` → `821`), so every query here is limited to one provider's own
 * customer ids. Never run these needles against the whole `users` table.
 */

export function sanitizeProviderClientSearchTerm(trimmed: string): string {
  return trimmed.replace(/[%_,()]/g, "");
}

export function buildUserContactSearchOrClauses(
  textTerms: string | string[],
  phoneNeedles: string[]
): string[] {
  const clauses: string[] = [];
  const terms = [...new Set(Array.isArray(textTerms) ? textTerms : [textTerms])];
  for (const term of terms) {
    const safe = sanitizeProviderClientSearchTerm(term);
    if (safe.length === 0) continue;
    clauses.push(`full_name.ilike.%${safe}%`, `email.ilike.%${safe}%`);
  }
  for (const needle of phoneNeedles) {
    clauses.push(`phone.ilike.%${needle}%`);
  }
  return clauses;
}

export function parseProviderClientSourceMetadata(
  sourceMetadata: unknown
): {
  provider_supplied_name: string | null;
  provider_supplied_email: string | null;
  provider_supplied_phone: string | null;
} {
  if (!sourceMetadata || typeof sourceMetadata !== "object") {
    return {
      provider_supplied_name: null,
      provider_supplied_email: null,
      provider_supplied_phone: null,
    };
  }
  const meta = sourceMetadata as Record<string, unknown>;
  return {
    provider_supplied_name:
      typeof meta.provider_supplied_name === "string" ? meta.provider_supplied_name : null,
    provider_supplied_email:
      typeof meta.provider_supplied_email === "string" ? meta.provider_supplied_email : null,
    provider_supplied_phone:
      typeof meta.provider_supplied_phone === "string" ? meta.provider_supplied_phone : null,
  };
}

export function contactMatchesSearchQuery(
  searchQuery: string,
  fields: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    provider_supplied_email?: string | null;
    provider_supplied_phone?: string | null;
    default_address?: { address_line1?: string; city?: string } | null;
  }
): boolean {
  const trimmed = searchQuery.trim();
  if (!trimmed) return true;
  const searchLower = trimmed.toLowerCase();
  const addrBlob = [fields.default_address?.address_line1, fields.default_address?.city]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (fields.full_name?.toLowerCase().includes(searchLower)) return true;
  if (fields.email?.toLowerCase().includes(searchLower)) return true;
  if (fields.provider_supplied_email?.toLowerCase().includes(searchLower)) return true;
  if (phoneMatchesQuery(fields.phone, trimmed)) return true;
  if (phoneMatchesQuery(fields.provider_supplied_phone, trimmed)) return true;
  if (addrBlob.length > 0 && addrBlob.includes(searchLower)) return true;
  return false;
}

/**
 * Users among `customerIds` whose name, email, or phone match the query.
 * SQL `ilike` covers name/email and phones stored as plain digits; a second
 * in-memory pass catches phones stored with spaces or dashes.
 */
async function matchUserIdsAmongIds(
  supabaseAdmin: SupabaseClient,
  customerIds: string[],
  searchQuery: string,
  extraTextTerms: string[] = []
): Promise<Set<string>> {
  const matched = new Set<string>();
  const trimmed = searchQuery.trim();
  if (!trimmed || customerIds.length === 0) return matched;

  const phoneNeedles = phoneSearchNeedles(trimmed);
  const orClauses = buildUserContactSearchOrClauses([trimmed, ...extraTextTerms], phoneNeedles);

  if (orClauses.length > 0) {
    const users = await fetchInIdChunks<{ id: string }>(
      customerIds,
      (slice) => supabaseAdmin.from("users").select("id").in("id", slice).or(orClauses.join(",")),
      { throwOnError: true },
    );
    users.forEach((u) => matched.add(u.id));
  }

  if (phoneNeedles.length > 0) {
    const remaining = customerIds.filter((id) => !matched.has(id));
    const users = await fetchInIdChunks<{ id: string; phone: string | null }>(
      remaining,
      (slice) =>
        supabaseAdmin
          .from("users")
          .select("id, phone")
          .in("id", slice)
          .not("phone", "is", null),
      { throwOnError: true },
    );
    for (const u of users) {
      if (phoneMatchesQuery(u.phone, trimmed)) matched.add(u.id);
    }
  }

  return matched;
}

export type ProviderClientIndexRow = {
  id: string;
  customer_id: string;
  source_metadata: unknown;
  notes: string | null;
  tags: string[] | null;
};

/** Every saved client row for a provider (paginated past the PostgREST cap). */
export async function loadProviderClientIndexRows(
  supabaseAdmin: SupabaseClient,
  providerId: string
): Promise<ProviderClientIndexRow[]> {
  return fetchAllPaged(async (from, to) => {
    const { data, error } = await supabaseAdmin
      .from("provider_clients")
      .select("id, customer_id, source_metadata, notes, tags")
      .eq("provider_id", providerId)
      .range(from, to);
    return { data: data as ProviderClientIndexRow[] | null, error };
  });
}

/**
 * Saved-client customer ids for this provider that match the query on the
 * account (name, email, phone), the provider-typed contact stored on a limited
 * link (`source_metadata.provider_supplied_*`), or the provider's own notes/tags.
 */
export async function findProviderSavedClientMatches(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  searchQuery: string
): Promise<{ matchedCustomerIds: Set<string>; savedRows: ProviderClientIndexRow[] }> {
  const trimmed = searchQuery.trim();
  const savedRows = await loadProviderClientIndexRows(supabaseAdmin, providerId);
  if (!trimmed || savedRows.length === 0) {
    return { matchedCustomerIds: new Set(), savedRows };
  }

  const allCustomerIds = [...new Set(savedRows.map((r) => r.customer_id).filter(Boolean))];
  const matchedCustomerIds = await matchUserIdsAmongIds(supabaseAdmin, allCustomerIds, trimmed);

  const lower = trimmed.toLowerCase();
  for (const row of savedRows) {
    if (matchedCustomerIds.has(row.customer_id)) continue;
    const meta = parseProviderClientSourceMetadata(row.source_metadata);
    if (
      meta.provider_supplied_name?.toLowerCase().includes(lower) ||
      meta.provider_supplied_email?.toLowerCase().includes(lower) ||
      phoneMatchesQuery(meta.provider_supplied_phone, trimmed) ||
      row.notes?.toLowerCase().includes(lower) ||
      row.tags?.some((tag) => tag.toLowerCase().includes(lower))
    ) {
      matchedCustomerIds.add(row.customer_id);
    }
  }

  return { matchedCustomerIds, savedRows };
}

/** Distinct booking customer ids for a provider, excluding cancelled / no-show (same rule as `/clients/serviced`). */
export async function loadServicedCustomerIdsForProvider(
  supabaseAdmin: SupabaseClient,
  providerId: string
): Promise<string[]> {
  const rows = await fetchAllPaged<{ customer_id: string | null }>(async (from, to) => {
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select("customer_id")
      .eq("provider_id", providerId)
      .not("status", "in", '("cancelled","no_show")')
      .range(from, to);
    return { data, error };
  });
  return [
    ...new Set(rows.map((r) => r.customer_id).filter((id): id is string => Boolean(id))),
  ];
}

/** Serviced customers who are not saved clients and match the query. */
export async function findServicedOnlyCustomerIdsBySearch(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  searchQuery: string,
  excludeCustomerIds: Set<string>
): Promise<string[]> {
  if (!searchQuery.trim()) return [];
  const servicedIds = await loadServicedCustomerIdsForProvider(supabaseAdmin, providerId);
  const candidates = servicedIds.filter((id) => !excludeCustomerIds.has(id));
  return [...(await matchUserIdsAmongIds(supabaseAdmin, candidates, searchQuery))];
}

/**
 * Name / email / phone match among a fixed customer id set. `extraTextTerms`
 * (e.g. per-word tokens) are also matched against name and email.
 */
export async function findCustomerIdsByContactSearchAmongIds(
  supabaseAdmin: SupabaseClient,
  customerIds: string[],
  searchQuery: string,
  extraTextTerms: string[] = []
): Promise<string[]> {
  return [
    ...(await matchUserIdsAmongIds(supabaseAdmin, customerIds, searchQuery, extraTextTerms)),
  ];
}

export async function loadDistinctBookingCustomerIdsForProvider(
  supabaseAdmin: SupabaseClient,
  providerId: string
): Promise<string[]> {
  const rows = await fetchAllPaged<{ customer_id: string | null }>(async (from, to) => {
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select("customer_id")
      .eq("provider_id", providerId)
      .not("customer_id", "is", null)
      .range(from, to);
    return { data, error };
  });
  return [
    ...new Set(rows.map((r) => r.customer_id).filter((id): id is string => Boolean(id))),
  ];
}

export async function loadDistinctSaleCustomerIdsForProvider(
  supabaseAdmin: SupabaseClient,
  providerId: string
): Promise<string[]> {
  const rows = await fetchAllPaged<{ customer_id: string | null }>(async (from, to) => {
    const { data, error } = await supabaseAdmin
      .from("sales")
      .select("customer_id")
      .eq("provider_id", providerId)
      .not("customer_id", "is", null)
      .range(from, to);
    return { data, error };
  });
  return [
    ...new Set(rows.map((r) => r.customer_id).filter((id): id is string => Boolean(id))),
  ];
}

/** Group bookings of this provider whose participants match name, email, or phone. */
export async function findGroupBookingIdsByParticipantContactSearch(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  searchQuery: string
): Promise<string[]> {
  const trimmed = searchQuery.trim();
  if (!trimmed) return [];

  const groupRows = await fetchAllPaged<{ id: string }>(async (from, to) => {
    const { data, error } = await supabaseAdmin
      .from("group_bookings")
      .select("id")
      .eq("provider_id", providerId)
      .range(from, to);
    return { data, error };
  });
  const groupIds = groupRows.map((g) => g.id).filter(Boolean);
  if (groupIds.length === 0) return [];

  const participants = await fetchInIdChunks<{
    group_booking_id: string | null;
    participant_name: string | null;
    participant_email: string | null;
    participant_phone: string | null;
  }>(groupIds, (slice) =>
    supabaseAdmin
      .from("booking_participants")
      .select("group_booking_id, participant_name, participant_email, participant_phone")
      .in("group_booking_id", slice)
  );

  const matched = new Set<string>();
  for (const p of participants) {
    if (!p.group_booking_id) continue;
    if (
      contactMatchesSearchQuery(trimmed, {
        full_name: p.participant_name,
        email: p.participant_email,
        phone: p.participant_phone,
      })
    ) {
      matched.add(p.group_booking_id);
    }
  }
  return [...matched];
}

/**
 * Cap for ids inlined into a PostgREST `.or(…id.in.(…))` clause: the list goes
 * into the request URL (~37 chars per uuid), so very broad queries are truncated.
 */
export const MAX_INLINE_MATCH_IDS = 200;
