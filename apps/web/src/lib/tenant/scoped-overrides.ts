import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export type ScopedSource = "tenant" | "global" | "none";
export type ScopeKind = "tenant" | "global";

export type ScopedReadResult<T> = {
  data: T | null;
  source: ScopedSource;
};

function sanitizeTenantId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

/**
 * Parse requested write scope from body/query.
 * - default: current request tenant
 * - superadmin may pass scope=global or scope=tenant + tenant_id
 */
export function resolveRequestedScope(
  request: Request,
  body: Record<string, unknown> | null | undefined,
  currentTenantId: string,
  options?: { allowGlobal?: boolean; allowTenantOverride?: boolean; actorRole?: string | null }
): { scope: ScopeKind; tenantId: string | null } {
  const search = new URL(request.url).searchParams;
  const requestedScopeRaw =
    (typeof body?.scope === "string" ? body.scope : search.get("scope")) ?? "tenant";
  const requestedScope = requestedScopeRaw === "global" ? "global" : "tenant";
  const requestedTenantId = sanitizeTenantId(
    body?.tenant_id ?? body?.tenantId ?? search.get("tenant_id") ?? search.get("tenantId")
  );

  const allowGlobal = options?.allowGlobal ?? true;
  const allowTenantOverride = options?.allowTenantOverride ?? true;
  const isSuperadmin = String(options?.actorRole ?? "").toLowerCase() === "superadmin";

  if (!isSuperadmin) {
    // Non-superadmins are always bound to current host tenant.
    return { scope: "tenant", tenantId: currentTenantId };
  }

  if (requestedScope === "global" && allowGlobal) {
    return { scope: "global", tenantId: null };
  }
  if (requestedTenantId && allowTenantOverride) {
    return { scope: "tenant", tenantId: requestedTenantId };
  }
  return { scope: "tenant", tenantId: currentTenantId };
}

/**
 * Resolve admin tenant context once and return scope helpers.
 */
export async function resolveAdminTenantContext(
  request: Request,
  body?: Record<string, unknown> | null,
  actorRole?: string | null
): Promise<{
  currentTenantId: string;
  requestedScope: { scope: ScopeKind; tenantId: string | null };
}> {
  const currentTenantId = await resolveAdminApiTenantId(request);
  const requestedScope = resolveRequestedScope(request, body, currentTenantId, { actorRole });
  return { currentTenantId, requestedScope };
}

/**
 * Read one scoped record with precedence:
 * tenant override -> global default.
 */
export async function fetchScopedSingle<T>(input: {
  supabase: any;
  table: string;
  tenantId: string;
  select: string;
  apply: (query: any) => any;
  orderBy?: { column: string; ascending?: boolean };
}): Promise<ScopedReadResult<T>> {
  const { supabase, table, tenantId, select, apply, orderBy } = input;
  const effectiveTenantId = sanitizeTenantId(tenantId);
  const build = (tenant: string | null) => {
    let q = apply(supabase.from(table).select(select));
    q = tenant ? q.eq("tenant_id", tenant) : q.is("tenant_id", null);
    if (orderBy) {
      q = q.order(orderBy.column, { ascending: orderBy.ascending ?? false });
    }
    return q.limit(1).maybeSingle();
  };

  if (effectiveTenantId) {
    const { data: tenantRow, error: tenantErr } = await build(effectiveTenantId);
    if (!tenantErr && tenantRow) {
      return { data: tenantRow as T, source: "tenant" };
    }
  }

  const { data: globalRow, error: globalErr } = await build(null);
  if (!globalErr && globalRow) {
    return { data: globalRow as T, source: "global" };
  }

  return { data: null, source: "none" };
}

/**
 * Read list data with tenant overrides merged over global defaults.
 * Dedupe key must identify the same logical entity in global+tenant scopes.
 */
export async function fetchScopedListMerged<T>(input: {
  supabase: any;
  table: string;
  tenantId: string;
  select: string;
  apply?: (query: any) => any;
  dedupeKey: (row: T) => string;
  orderBy?: { column: string; ascending?: boolean };
}): Promise<{ data: T[]; source: ScopedSource }> {
  const { supabase, table, tenantId, select, apply, dedupeKey, orderBy } = input;
  const effectiveTenantId = sanitizeTenantId(tenantId);
  const decorate = (query: any) => {
    let q = apply ? apply(query) : query;
    if (orderBy) {
      q = q.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    }
    return q;
  };

  let tenantRows: T[] | null = null;
  let tenantErr: unknown = null;
  if (effectiveTenantId) {
    const tenantRes = await decorate(
      supabase.from(table).select(select).eq("tenant_id", effectiveTenantId)
    );
    tenantRows = (tenantRes.data ?? null) as T[] | null;
    tenantErr = tenantRes.error ?? null;
  }
  const { data: globalRows, error: globalErr } = await decorate(
    supabase.from(table).select(select).is("tenant_id", null)
  );

  if (tenantErr && globalErr) {
    return { data: [], source: "none" };
  }

  const out = new Map<string, T>();
  for (const row of (globalRows ?? []) as T[]) {
    out.set(dedupeKey(row), row);
  }
  for (const row of (tenantRows ?? []) as T[]) {
    out.set(dedupeKey(row), row);
  }

  const source: ScopedSource =
    (tenantRows?.length ?? 0) > 0 ? "tenant" : (globalRows?.length ?? 0) > 0 ? "global" : "none";

  return { data: [...out.values()], source };
}
