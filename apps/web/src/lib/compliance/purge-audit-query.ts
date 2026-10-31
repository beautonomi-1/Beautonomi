import type { SupabaseClient } from "@supabase/supabase-js";

export const COMPLIANCE_PURGE_AUDIT_TYPES = ["user", "provider_org", "tenant_reset"] as const;
export type CompliancePurgeAuditTypeFilter = (typeof COMPLIANCE_PURGE_AUDIT_TYPES)[number];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const COMPLIANCE_PURGE_AUDIT_LIST_COLUMNS =
  "id, created_at, actor_user_id, tenant_id, purge_type, target_user_id, provider_id, reason, purged_user_ids, purge_after_at";

export const COMPLIANCE_PURGE_AUDIT_DETAIL_COLUMNS = `${COMPLIANCE_PURGE_AUDIT_LIST_COLUMNS}, report`;

export const COMPLIANCE_PURGE_AUDIT_LIST_SELECT = `
  ${COMPLIANCE_PURGE_AUDIT_LIST_COLUMNS},
  actor:users!compliance_purge_audit_log_actor_user_id_fkey(id, full_name, email)
`;

export function parseCompliancePurgeAuditPagination(searchParams: URLSearchParams): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const rawLimit = parseInt(searchParams.get("limit") || "50", 10);
  const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/** Escape user input for PostgREST `.or()` / `ilike` filters. */
export function escapePostgrestIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/,/g, "\\,");
}

export function isValidCompliancePurgeAuditId(id: string): boolean {
  return UUID_REGEX.test(id);
}

export type CompliancePurgeAuditFilterParams = {
  purge_type?: string | null;
  actor_user_id?: string | null;
  tenant_id?: string | null;
  target_user_id?: string | null;
  provider_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  search?: string | null;
};

export function readCompliancePurgeAuditFilters(
  searchParams: URLSearchParams,
): CompliancePurgeAuditFilterParams {
  return {
    purge_type: searchParams.get("purge_type"),
    actor_user_id: searchParams.get("actor_user_id"),
    tenant_id: searchParams.get("tenant_id"),
    target_user_id: searchParams.get("target_user_id"),
    provider_id: searchParams.get("provider_id"),
    start_date: searchParams.get("start_date"),
    end_date: searchParams.get("end_date"),
    search: searchParams.get("search"),
  };
}

export function validatePurgeTypeFilter(
  purgeType: string | null | undefined,
): purgeType is CompliancePurgeAuditTypeFilter | null | undefined {
  if (purgeType == null || purgeType === "") return true;
  return (COMPLIANCE_PURGE_AUDIT_TYPES as readonly string[]).includes(purgeType);
}

// Supabase's filter builder is too deep to constrain with a recursive generic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyCompliancePurgeAuditFilters(query: any, filters: CompliancePurgeAuditFilterParams): any {
  let q = query;
  if (filters.purge_type) {
    q = q.eq("purge_type", filters.purge_type);
  }
  if (filters.actor_user_id) {
    q = q.eq("actor_user_id", filters.actor_user_id);
  }
  if (filters.tenant_id) {
    q = q.eq("tenant_id", filters.tenant_id);
  }
  if (filters.target_user_id) {
    q = q.eq("target_user_id", filters.target_user_id);
  }
  if (filters.provider_id) {
    q = q.eq("provider_id", filters.provider_id);
  }
  if (filters.start_date) {
    q = q.gte("created_at", filters.start_date);
  }
  if (filters.end_date) {
    q = q.lte("created_at", filters.end_date);
  }
  if (filters.search?.trim()) {
    const pattern = `%${escapePostgrestIlikePattern(filters.search.trim())}%`;
    q = q.ilike("reason", pattern);
  }
  return q;
}

export type PurgeAuditActorEmbed = {
  id?: string;
  full_name?: string | null;
  email?: string | null;
};

export type PurgeAuditListRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  tenant_id: string | null;
  purge_type: string | null;
  target_user_id: string | null;
  provider_id: string | null;
  reason: string | null;
  purged_user_ids: string[] | null;
  purge_after_at: string | null;
  report?: unknown;
  actor?: PurgeAuditActorEmbed | null;
};

export function normalizePurgeAuditRow(row: PurgeAuditListRow): PurgeAuditListRow {
  const actorRaw = row.actor;
  const actor =
    actorRaw && typeof actorRaw === "object"
      ? {
          id: actorRaw.id,
          full_name: actorRaw.full_name ?? null,
          email: actorRaw.email ?? null,
        }
      : null;
  return { ...row, actor };
}

export async function fetchCompliancePurgeAuditById(
  admin: SupabaseClient,
  id: string,
): Promise<{ data: PurgeAuditListRow | null; error: { message: string } | null }> {
  const { data, error } = await admin
    .from("compliance_purge_audit_log")
    .select(COMPLIANCE_PURGE_AUDIT_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { data: null, error: { message: error.message } };
  }
  return { data: data ? normalizePurgeAuditRow(data as PurgeAuditListRow) : null, error: null };
}

export async function fetchCompliancePurgeAuditList(
  admin: SupabaseClient,
  opts: {
    filters: CompliancePurgeAuditFilterParams;
    offset: number;
    limit: number;
    withActorEmbed?: boolean;
  },
): Promise<{
  rows: PurgeAuditListRow[];
  count: number;
  error: { message: string } | null;
  actorEmbedFailed?: boolean;
}> {
  const withActor = opts.withActorEmbed !== false;

  const runQuery = (select: string) => {
    let query = admin.from("compliance_purge_audit_log").select(select, { count: "exact" });
    query = applyCompliancePurgeAuditFilters(query, opts.filters);
    return query.order("created_at", { ascending: false }).range(opts.offset, opts.offset + opts.limit - 1);
  };

  if (withActor) {
    const { data, error, count } = await runQuery(COMPLIANCE_PURGE_AUDIT_LIST_SELECT);
    if (!error) {
      const rows = (data ?? []).map((r: unknown) =>
        normalizePurgeAuditRow(r as unknown as PurgeAuditListRow),
      );
      return { rows, count: count ?? 0, error: null };
    }
    console.warn("[purge-audit] actor embed failed, retrying without join:", error.message);
  }

  const { data, error, count } = await runQuery(COMPLIANCE_PURGE_AUDIT_LIST_COLUMNS);
  if (error) {
    return { rows: [], count: 0, error: { message: error.message } };
  }
  const rows = (data ?? []).map((r: unknown) =>
    normalizePurgeAuditRow(r as unknown as PurgeAuditListRow),
  );
  return { rows, count: count ?? 0, error: null, actorEmbedFailed: withActor };
}

/** Export cap — same filters as list, no report column. */
export const COMPLIANCE_PURGE_AUDIT_EXPORT_MAX_ROWS = 2000;

export async function fetchCompliancePurgeAuditForExport(
  admin: SupabaseClient,
  filters: CompliancePurgeAuditFilterParams,
): Promise<{ rows: PurgeAuditListRow[]; truncated: boolean; error: { message: string } | null }> {
  const runExportQuery = (select: string) => {
    let query = admin.from("compliance_purge_audit_log").select(select);
    query = applyCompliancePurgeAuditFilters(query, filters);
    return query.order("created_at", { ascending: false }).limit(COMPLIANCE_PURGE_AUDIT_EXPORT_MAX_ROWS + 1);
  };

  const actorSelect = `${COMPLIANCE_PURGE_AUDIT_LIST_COLUMNS}, actor:users!compliance_purge_audit_log_actor_user_id_fkey(id, full_name, email)`;
  let { data, error } = await runExportQuery(actorSelect);

  if (error) {
    console.warn("[purge-audit-export] actor embed failed, retrying without join:", error.message);
    const fallback = await runExportQuery(COMPLIANCE_PURGE_AUDIT_LIST_COLUMNS);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return { rows: [], truncated: false, error: { message: error.message } };
  }
  const all = (data ?? []) as unknown as PurgeAuditListRow[];
  const truncated = all.length > COMPLIANCE_PURGE_AUDIT_EXPORT_MAX_ROWS;
  const slice = truncated ? all.slice(0, COMPLIANCE_PURGE_AUDIT_EXPORT_MAX_ROWS) : all;
  return {
    rows: slice.map(normalizePurgeAuditRow),
    truncated,
    error: null,
  };
}
