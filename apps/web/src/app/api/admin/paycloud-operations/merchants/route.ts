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
import { validatePaycloudAppMatchesMerchantEnv } from "@/lib/payments/paycloud-merchant-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

const createMerchantSchema = z.object({
  label: z.string().trim().min(1),
  merchant_no: z.string().trim().min(1),
  store_no: z.string().trim().min(1),
  environment: z.enum(["live", "sandbox"]).default("live"),
  paycloud_app_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

const patchMerchantSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).optional(),
  merchant_no: z.string().trim().min(1).optional(),
  store_no: z.string().trim().min(1).optional(),
  environment: z.enum(["live", "sandbox"]).optional(),
  paycloud_app_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/admin/paycloud-operations/merchants
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 50, maxLimit: 200 });
    const environment = searchParams.get("environment");
    const activeOnly = searchParams.get("active_only") === "true";

    let query = (supabase.from("paycloud_merchants") as any)
      .select(
        `
          *,
          app:tenant_paycloud_apps(id, environment, app_id, is_enabled)
        `,
        { count: "exact" },
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (environment) query = query.eq("environment", environment);
    if (activeOnly) query = query.eq("is_active", true);

    const { data, error, count } = await query;
    if (error) throw error;

    return successResponse({
      items: data ?? [],
      total: count ?? 0,
      limit,
      offset,
      hasMore: (count ?? 0) > offset + limit,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load PayCloud merchants");
  }
}

/**
 * POST /api/admin/paycloud-operations/merchants
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const parsed = createMerchantSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((issue) => issue.message).join(", "),
        "VALIDATION_ERROR",
        400,
      );
    }

    if (parsed.data.paycloud_app_id) {
      const envCheck = await validatePaycloudAppMatchesMerchantEnv(
        supabase,
        parsed.data.paycloud_app_id,
        parsed.data.environment,
      );
      if (envCheck.ok === false) {
        return errorResponse(envCheck.message, "VALIDATION_ERROR", 400);
      }
    }

    const { data: merchant, error } = await (supabase.from("paycloud_merchants") as any)
      .insert({
        tenant_id: tenantId,
        label: parsed.data.label,
        merchant_no: parsed.data.merchant_no,
        store_no: parsed.data.store_no,
        environment: parsed.data.environment,
        paycloud_app_id: parsed.data.paycloud_app_id ?? null,
        is_active: parsed.data.is_active ?? true,
      })
      .select(
        `
          *,
          app:tenant_paycloud_apps(id, environment, app_id, is_enabled)
        `,
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return errorResponse(
          "A merchant with this merchant_no/store_no/environment already exists for this tenant.",
          "DUPLICATE_MERCHANT",
          409,
        );
      }
      throw error;
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.paycloud.merchants.created",
      entity_type: "paycloud_merchants",
      entity_id: (merchant as { id?: string }).id ?? null,
      metadata: {
        merchant_no: parsed.data.merchant_no,
        store_no: parsed.data.store_no,
        environment: parsed.data.environment,
      },
    });

    return successResponse(merchant, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create PayCloud merchant");
  }
}

/**
 * PATCH /api/admin/paycloud-operations/merchants
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const parsed = patchMerchantSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((issue) => issue.message).join(", "),
        "VALIDATION_ERROR",
        400,
      );
    }

    const { data: existing } = await (supabase.from("paycloud_merchants") as any)
      .select("id, environment")
      .eq("id", parsed.data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!existing) return notFoundResponse("Merchant not found");

    const targetEnv = parsed.data.environment ?? (existing as { environment?: string }).environment ?? "live";
    if (parsed.data.paycloud_app_id) {
      const envCheck = await validatePaycloudAppMatchesMerchantEnv(
        supabase,
        parsed.data.paycloud_app_id,
        targetEnv,
      );
      if (envCheck.ok === false) {
        return errorResponse(envCheck.message, "VALIDATION_ERROR", 400);
      }
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.label !== undefined) updates.label = parsed.data.label;
    if (parsed.data.merchant_no !== undefined) updates.merchant_no = parsed.data.merchant_no;
    if (parsed.data.store_no !== undefined) updates.store_no = parsed.data.store_no;
    if (parsed.data.environment !== undefined) updates.environment = parsed.data.environment;
    if (parsed.data.paycloud_app_id !== undefined) updates.paycloud_app_id = parsed.data.paycloud_app_id;
    if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;

    const { data: merchant, error } = await (supabase.from("paycloud_merchants") as any)
      .update(updates)
      .eq("id", parsed.data.id)
      .eq("tenant_id", tenantId)
      .select(
        `
          *,
          app:tenant_paycloud_apps(id, environment, app_id, is_enabled)
        `,
      )
      .single();
    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.paycloud.merchants.updated",
      entity_type: "paycloud_merchants",
      entity_id: parsed.data.id,
      metadata: { fields: Object.keys(updates).filter((k) => k !== "updated_at") },
    });

    return successResponse(merchant);
  } catch (error) {
    return handleApiError(error, "Failed to update PayCloud merchant");
  }
}
