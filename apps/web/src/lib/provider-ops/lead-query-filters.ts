/** Shared filter helpers for provider_leads list/export queries. */

export function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "");
}

export function parseCategoryIds(searchParams: URLSearchParams): string[] {
  const raw = [
    ...searchParams.getAll("category_ids"),
    ...searchParams.getAll("category_id"),
  ];
  const seen = new Set<string>();
  for (const value of raw) {
    for (const part of value.split(",")) {
      const id = part.trim();
      if (id) seen.add(id);
    }
  }
  return [...seen];
}

export function applyAssignedToFilter<
  T extends { eq: (a: string, b: string) => T; is: (a: string, b: null) => T },
>(q: T, assignedTo: string | null): T {
  if (!assignedTo) return q;
  if (assignedTo === "unassigned") return q.is("assigned_to", null);
  return q.eq("assigned_to", assignedTo);
}

/** PostgREST embed for `provider_leads.assigned_to` → `users`. */
export const LEADS_ASSIGNED_USER_EMBED =
  "assigned_user:users!provider_leads_assigned_to_fkey(id, email, full_name)";

export const LEADS_REFERRER_USER_EMBED =
  "referrer_user:users!provider_leads_referrer_user_id_fkey(id, email, full_name)";

export const LEADS_REFERRER_PROVIDER_EMBED =
  "referrer_provider:providers!provider_leads_referrer_provider_id_fkey(id, business_name, email, billing_email, user_id)";

export const LEADS_EXPORT_SELECT = `
  *,
  ${LEADS_ASSIGNED_USER_EMBED},
  ${LEADS_REFERRER_USER_EMBED},
  ${LEADS_REFERRER_PROVIDER_EMBED},
  provider_lead_categories (
    global_category_id,
    global_service_categories:global_category_id (name)
  )
`;

/** Exclude soft-deleted leads (default for list/export/matching). */
export function applyActiveLeadFilter<
  T extends { is: (col: string, val: null) => T; not: (col: string, op: string, val: null) => T },
>(q: T, mode: "active" | "deleted" | "all" = "active"): T {
  if (mode === "deleted") return q.not("deleted_at", "is", null);
  if (mode === "all") return q;
  return q.is("deleted_at", null);
}

export function parseDeletedFilter(searchParams: URLSearchParams): "active" | "deleted" | "all" {
  const v = searchParams.get("deleted");
  if (v === "only" || v === "true") return "deleted";
  if (v === "all") return "all";
  return "active";
}

export type LeadContactFilter =
  | "all"
  | "complete"
  | "has_phone"
  | "has_email"
  | "missing_phone"
  | "missing_email"
  | "incomplete";

const VALID_CONTACT_FILTERS = new Set<LeadContactFilter>([
  "all",
  "complete",
  "has_phone",
  "has_email",
  "missing_phone",
  "missing_email",
  "incomplete",
]);

export function parseContactFilter(searchParams: URLSearchParams): LeadContactFilter {
  const v = searchParams.get("contact")?.trim();
  if (v && VALID_CONTACT_FILTERS.has(v as LeadContactFilter)) {
    return v as LeadContactFilter;
  }
  return "all";
}

/** PostgREST filter builder (typed loosely to avoid deep Supabase generic instantiation). */
type ContactFilterQuery = {
  is: (col: string, val: null) => ContactFilterQuery;
  not: (col: string, op: string, val: null) => ContactFilterQuery;
  neq: (col: string, val: string) => ContactFilterQuery;
  or: (filters: string) => ContactFilterQuery;
};

/** Filter leads by email/phone completeness. */
export function applyContactFilter(q: ContactFilterQuery, contact: LeadContactFilter): ContactFilterQuery {
  if (contact === "all") return q;

  if (contact === "missing_phone") {
    return q.or("phone_e164.is.null,phone_e164.eq.");
  }
  if (contact === "missing_email") {
    return q.or("email.is.null,email.eq.");
  }
  if (contact === "incomplete") {
    return q.or("phone_e164.is.null,phone_e164.eq.,email.is.null,email.eq.");
  }
  if (contact === "has_phone") {
    return q.not("phone_e164", "is", null).neq("phone_e164", "");
  }
  if (contact === "has_email") {
    return q.not("email", "is", null).neq("email", "");
  }
  if (contact === "complete") {
    return q
      .not("phone_e164", "is", null)
      .neq("phone_e164", "")
      .not("email", "is", null)
      .neq("email", "");
  }

  return q;
}
