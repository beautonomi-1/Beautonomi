import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  getOffsetPaginationParams,
  handleApiError,
  notFoundResponse,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog } from "@/lib/audit/audit";

const assignTerminalSchema = z.object({
  terminal_sn: z.string().trim().min(1),
  display_name: z.string().trim().min(1),
  provider_id: z.string().uuid(),
  paycloud_merchant_id: z.string().uuid(),
  location_id: z.string().uuid().optional().nullable(),
  model: z.string().trim().optional().nullable(),
});

const patchTerminalSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reassign"),
    terminal_id: z.string().uuid(),
    provider_id: z.string().uuid(),
    location_id: z.string().uuid().optional().nullable(),
    paycloud_merchant_id: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal("suspend"),
    terminal_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("unsuspend"),
    terminal_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("unassign"),
    terminal_id: z.string().uuid(),
  }),
  /** Cutover safety: retire every sandbox machine in the admin-scoped tenant at once. */
  z.object({
    action: z.literal("decommission_sandbox"),
  }),
]);

function buildSummary(rows: Array<{ status?: string; is_active?: boolean; provider_id?: string | null }>) {
  return rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.is_active) acc.active += 1;
      if (row.status === "in_stock") acc.in_stock += 1;
      if (row.status === "assigned" || row.status === "active") acc.assigned += 1;
      if (row.status === "suspended") acc.suspended += 1;
      if (!row.provider_id) acc.unassigned += 1;
      return acc;
    },
    { total: 0, active: 0, in_stock: 0, assigned: 0, suspended: 0, unassigned: 0 },
  );
}

/**
 * GET /api/admin/paycloud-operations/terminals
 *
 * Fleet registry for PayCloud terminals. Superadmin only.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 50, maxLimit: 200 });
    const status = searchParams.get("status");
    const providerId = searchParams.get("provider_id");
    const search = searchParams.get("search")?.trim();

    let query = (supabase.from("paycloud_terminals") as any)
      .select(
        `
          *,
          provider:providers(id, business_name, slug),
          merchant:paycloud_merchants(id, label, merchant_no, store_no, environment),
          location:provider_locations(id, name)
        `,
        { count: "exact" },
      )
      .eq("tenant_id", tenantId)
      .not("status", "eq", "decommissioned")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (providerId) query = query.eq("provider_id", providerId);
    if (search) {
      const safe = search.replace(/[%_]/g, "");
      query = query.or(
        [`display_name.ilike.%${safe}%`, `terminal_sn.ilike.%${safe}%`, `model.ilike.%${safe}%`].join(
          ",",
        ),
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;
    const rows = data ?? [];

    let summaryQuery = (supabase.from("paycloud_terminals") as any)
      .select("status, is_active, provider_id")
      .eq("tenant_id", tenantId)
      .not("status", "eq", "decommissioned");
    if (status) summaryQuery = summaryQuery.eq("status", status);
    if (providerId) summaryQuery = summaryQuery.eq("provider_id", providerId);
    if (search) {
      const safe = search.replace(/[%_]/g, "");
      summaryQuery = summaryQuery.or(
        [`display_name.ilike.%${safe}%`, `terminal_sn.ilike.%${safe}%`, `model.ilike.%${safe}%`].join(","),
      );
    }
    const { data: summaryRows, error: summaryError } = await summaryQuery;
    if (summaryError) throw summaryError;

    return successResponse({
      items: rows,
      total: count ?? 0,
      limit,
      offset,
      hasMore: (count ?? 0) > offset + limit,
      summary: buildSummary(summaryRows ?? []),
    });
  } catch (error) {
    return handleApiError(error, "Failed to load PayCloud terminal fleet");
  }
}

/**
 * POST /api/admin/paycloud-operations/terminals
 *
 * Assign a terminal to a provider (admin source).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const parsed = assignTerminalSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((issue) => issue.message).join(", "),
        "VALIDATION_ERROR",
        400,
      );
    }

    const { data: provider } = await supabase
      .from("providers")
      .select("id, tenant_id")
      .eq("id", parsed.data.provider_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!provider) return notFoundResponse("Provider not found");

    if (parsed.data.location_id) {
      const { data: location } = await supabase
        .from("provider_locations")
        .select("id")
        .eq("id", parsed.data.location_id)
        .eq("provider_id", parsed.data.provider_id)
        .maybeSingle();
      if (!location) {
        return errorResponse("Location does not belong to this provider.", "VALIDATION_ERROR", 400);
      }
    }

    const merchantId = parsed.data.paycloud_merchant_id;
    const { data: merchant } = await supabase
      .from("paycloud_merchants")
      .select("id, is_active")
      .eq("id", merchantId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!merchant) {
      return errorResponse("PayCloud merchant not found for this tenant.", "NOT_FOUND", 404);
    }
    if (!(merchant as { is_active?: boolean }).is_active) {
      return errorResponse("PayCloud merchant is inactive.", "MERCHANT_INACTIVE", 400);
    }

    const now = new Date().toISOString();
    const { data: terminal, error } = await (supabase.from("paycloud_terminals") as any)
      .insert({
        tenant_id: tenantId,
        provider_id: parsed.data.provider_id,
        paycloud_merchant_id: merchantId,
        location_id: parsed.data.location_id ?? null,
        terminal_sn: parsed.data.terminal_sn,
        display_name: parsed.data.display_name,
        model: parsed.data.model ?? null,
        status: "assigned",
        source: "admin",
        is_active: true,
        assigned_by: user.id,
        assigned_at: now,
      })
      .select(
        `
          *,
          provider:providers(id, business_name, slug),
          merchant:paycloud_merchants(id, label, merchant_no, store_no, environment),
          location:provider_locations(id, name)
        `,
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return errorResponse(
          "This terminal serial is already registered for this tenant.",
          "DUPLICATE_TERMINAL",
          409,
        );
      }
      throw error;
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.paycloud.terminals.assigned",
      entity_type: "paycloud_terminals",
      entity_id: (terminal as { id?: string }).id ?? null,
      metadata: {
        provider_id: parsed.data.provider_id,
        terminal_sn: parsed.data.terminal_sn,
        source: "admin",
      },
    });

    return successResponse(terminal, 201);
  } catch (error) {
    return handleApiError(error, "Failed to assign PayCloud terminal");
  }
}

/**
 * PATCH /api/admin/paycloud-operations/terminals
 *
 * Reassign or suspend/unsuspend a terminal.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const parsed = patchTerminalSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((issue) => issue.message).join(", "),
        "VALIDATION_ERROR",
        400,
      );
    }

    if (parsed.data.action === "decommission_sandbox") {
      const now = new Date().toISOString();
      const { data: sandboxTerminals, error: loadErr } = await (supabase.from("paycloud_terminals") as any)
        .select("id, terminal_sn, merchant:paycloud_merchants(environment)")
        .eq("tenant_id", tenantId)
        .not("status", "eq", "decommissioned");
      if (loadErr) throw loadErr;
      const ids = (sandboxTerminals ?? [])
        .filter(
          (row: { merchant?: { environment?: string } | null }) =>
            row.merchant?.environment === "sandbox",
        )
        .map((row: { id: string }) => row.id);
      if (ids.length === 0) {
        return successResponse({ decommissioned_count: 0, terminal_ids: [] });
      }
      const { error: updateErr } = await (supabase.from("paycloud_terminals") as any)
        .update({
          status: "decommissioned",
          is_active: false,
          in_flight_payment_id: null,
          updated_at: now,
        })
        .in("id", ids)
        .eq("tenant_id", tenantId);
      if (updateErr) throw updateErr;
      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: (user as { role?: string }).role ?? "superadmin",
        action: "admin.paycloud.terminals.decommission_sandbox_bulk",
        entity_type: "paycloud_terminals",
        entity_id: null,
        metadata: { terminal_ids: ids, count: ids.length },
      });
      return successResponse({ decommissioned_count: ids.length, terminal_ids: ids });
    }

    const { data: existing } = await (supabase.from("paycloud_terminals") as any)
      .select("id, provider_id, status, terminal_sn")
      .eq("id", parsed.data.terminal_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!existing) return notFoundResponse("Terminal not found");

    const now = new Date().toISOString();
    let updates: Record<string, unknown> = { updated_at: now };
    let auditAction = "admin.paycloud.terminals.updated";

    if (parsed.data.action === "reassign") {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("id", parsed.data.provider_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!provider) return notFoundResponse("Provider not found");

      if (parsed.data.location_id) {
        const { data: location } = await supabase
          .from("provider_locations")
          .select("id")
          .eq("id", parsed.data.location_id)
          .eq("provider_id", parsed.data.provider_id)
          .maybeSingle();
        if (!location) {
          return errorResponse("Location does not belong to this provider.", "VALIDATION_ERROR", 400);
        }
      }

      if (parsed.data.paycloud_merchant_id) {
        const { data: merchant } = await supabase
          .from("paycloud_merchants")
          .select("id")
          .eq("id", parsed.data.paycloud_merchant_id)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (!merchant) {
          return errorResponse("PayCloud merchant not found for this tenant.", "NOT_FOUND", 404);
        }
        updates.paycloud_merchant_id = parsed.data.paycloud_merchant_id;
      }

      updates = {
        ...updates,
        provider_id: parsed.data.provider_id,
        location_id: parsed.data.location_id ?? null,
        status: "assigned",
        is_active: true,
        assigned_by: user.id,
        assigned_at: now,
        in_flight_payment_id: null,
      };
      auditAction = "admin.paycloud.terminals.reassigned";
    } else if (parsed.data.action === "suspend") {
      updates = {
        ...updates,
        status: "suspended",
        is_active: false,
        in_flight_payment_id: null,
      };
      auditAction = "admin.paycloud.terminals.suspended";
    } else if (parsed.data.action === "unassign") {
      updates = {
        ...updates,
        provider_id: null,
        location_id: null,
        status: "in_stock",
        is_active: true,
        in_flight_payment_id: null,
      };
      auditAction = "admin.paycloud.terminals.unassigned";
    } else {
      updates = {
        ...updates,
        status: "active",
        is_active: true,
      };
      auditAction = "admin.paycloud.terminals.unsuspended";
    }

    const { data: terminal, error } = await (supabase.from("paycloud_terminals") as any)
      .update(updates)
      .eq("id", parsed.data.terminal_id)
      .eq("tenant_id", tenantId)
      .select(
        `
          *,
          provider:providers(id, business_name, slug),
          merchant:paycloud_merchants(id, label, merchant_no, store_no, environment),
          location:provider_locations(id, name)
        `,
      )
      .single();
    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: auditAction,
      entity_type: "paycloud_terminals",
      entity_id: parsed.data.terminal_id,
      metadata: {
        action: parsed.data.action,
        provider_id:
          parsed.data.action === "reassign"
            ? parsed.data.provider_id
            : (existing as { provider_id?: string | null }).provider_id,
        terminal_sn: (existing as { terminal_sn?: string }).terminal_sn,
      },
    });

    return successResponse(terminal);
  } catch (error) {
    return handleApiError(error, "Failed to update PayCloud terminal");
  }
}
