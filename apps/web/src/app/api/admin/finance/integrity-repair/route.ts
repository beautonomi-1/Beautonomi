import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { manualAdjustmentSchema, postManualFinanceAdjustment } from "@/lib/finance/post-manual-adjustment";
import { checkPeriodLock } from "@/lib/finance/period-lock";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const bodySchema = z.object({
  repair_key: z.string().min(1).max(128),
  idempotency_key: z.string().min(1).max(128),
  dry_run: z.boolean().optional(),
  tenant_id: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/admin/finance/integrity-repair
 * Idempotent repair entry point (DB-backed via finance_integrity_repairs).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const supabase = getSupabaseAdmin();
    const tenantId = body.tenant_id ?? (await resolveAdminApiTenantId(request));

    const { data: existing } = await supabase
      .from("finance_integrity_repairs")
      .select("id, status, result, dry_run")
      .eq("repair_key", body.repair_key)
      .eq("idempotency_key", body.idempotency_key)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        data: {
          status: "already_applied",
          repair_key: body.repair_key,
          idempotency_key: body.idempotency_key,
          prior: existing,
        },
        error: null,
      });
    }

    if (body.dry_run) {
      const preview = await previewRepair(body.repair_key, body.payload, tenantId, supabase);
      await supabase.from("finance_integrity_repairs").insert({
        repair_key: body.repair_key,
        idempotency_key: body.idempotency_key,
        tenant_id: tenantId,
        payload: body.payload ?? {},
        dry_run: true,
        status: "dry_run",
        result: preview,
        created_by: user?.id ?? null,
      });
      return NextResponse.json({
        data: {
          status: "dry_run",
          repair_key: body.repair_key,
          preview,
        },
        error: null,
      });
    }

    const applied = await applyRepair({
      supabase,
      repairKey: body.repair_key,
      payload: body.payload,
      tenantId,
      createdBy: user?.id ?? null,
    });

    if (applied.ok === false) {
      await supabase.from("finance_integrity_repairs").insert({
        repair_key: body.repair_key,
        idempotency_key: body.idempotency_key,
        tenant_id: tenantId,
        payload: body.payload ?? {},
        dry_run: false,
        status: "failed",
        error_message: applied.message,
        created_by: user?.id ?? null,
      });
      return NextResponse.json(
        {
          data: null,
          error: {
            message: applied.message,
            code: applied.code,
          },
        },
        { status: applied.httpStatus },
      );
    }

    await supabase.from("finance_integrity_repairs").insert({
        repair_key: body.repair_key,
        idempotency_key: body.idempotency_key,
        tenant_id: tenantId,
        payload: body.payload ?? {},
        dry_run: false,
        status: "applied",
        result: applied.result,
        created_by: user?.id ?? null,
    });

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_role: user?.role ?? "superadmin",
      action: "admin.finance.integrity_repair",
      entity_type: "finance_integrity_repair",
      entity_id: body.repair_key,
      module: "finance",
      risk_level: "high",
      retention_tier: "financial",
      status: "succeeded",
      metadata: { idempotency_key: body.idempotency_key, tenant_id: tenantId },
      ...extractRequestMeta(request),
    });

    return NextResponse.json({
      data: {
        status: "applied",
        repair_key: body.repair_key,
        result: applied.result,
      },
      error: null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { data: null, error: { message: "Invalid request body", code: "VALIDATION_ERROR" } },
        { status: 400 },
      );
    }
    console.error("[admin/finance/integrity-repair]", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Integrity repair failed",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 },
    );
  }
}

async function previewRepair(
  repairKey: string,
  payload: Record<string, unknown> | undefined,
  tenantId: string | null,
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<Record<string, unknown>> {
  if (repairKey === "manual_adjustment") {
    const parsed = manualAdjustmentSchema.safeParse(payload);
    if (!parsed.success) {
      return { valid: false, issues: parsed.error.issues };
    }
    const effectiveAt = parsed.data.effective_at ?? new Date().toISOString();
    const lock = tenantId ? await checkPeriodLock(supabase, tenantId, effectiveAt) : { locked: false };
    return {
      valid: true,
      would_post: parsed.data,
      period_locked: lock.locked,
    };
  }
  return { valid: false, message: `Repair key "${repairKey}" is not implemented yet.` };
}

async function applyRepair(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  repairKey: string;
  payload: Record<string, unknown> | undefined;
  tenantId: string | null;
  createdBy: string | null;
}): Promise<
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; message: string; code: string; httpStatus: number }
> {
  if (params.repairKey === "manual_adjustment") {
    const parsed = manualAdjustmentSchema.safeParse(params.payload);
    if (!parsed.success) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        httpStatus: 400,
        message: parsed.error.issues[0]?.message ?? "Invalid adjustment payload",
      };
    }
    if (!params.tenantId) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        httpStatus: 400,
        message: "tenant_id is required for manual_adjustment repairs",
      };
    }
    if (!params.createdBy) {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        httpStatus: 401,
        message: "Authenticated admin required",
      };
    }

    const effectiveAt = parsed.data.effective_at ?? new Date().toISOString();
    const lock = await checkPeriodLock(params.supabase, params.tenantId, effectiveAt);
    if (lock.locked) {
      return {
        ok: false,
        code: "PERIOD_LOCKED",
        httpStatus: 409,
        message: `effective_at falls inside a locked finance period`,
      };
    }

    const posted = await postManualFinanceAdjustment(params.supabase, {
      tenantId: params.tenantId,
      input: parsed.data,
      createdBy: params.createdBy,
      source: "admin_finance_adjustment",
    });
    if (posted.ok === false) {
      return {
        ok: false,
        code: "POST_FAILED",
        httpStatus: 500,
        message: posted.reason,
      };
    }
    return { ok: true, result: { adjustment: posted.adjustment } };
  }

  return {
    ok: false,
    code: "REPAIR_NOT_IMPLEMENTED",
    httpStatus: 501,
    message: `Repair key "${params.repairKey}" is not implemented yet.`,
  };
}
