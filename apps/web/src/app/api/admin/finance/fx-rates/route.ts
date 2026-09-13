import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import {
  buildFxCoverageMatrix,
  fetchLastCronRun,
  fetchLastIngestSummary,
  runFxSelfCheck,
} from "@/lib/fx/admin-fx-desk";
import { bustFxRateMemo } from "@/lib/fx/get-fx-rate";

const ISO_4217 = /^[A-Za-z]{3}$/;

const overrideSchema = z.object({
  base: z.string().length(3),
  quote: z.string().length(3),
  rate: z.number().positive(),
  rate_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hold_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  note: z.string().min(8),
  confirm_outlier: z.boolean().optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid().optional(),
  base: z.string().length(3).optional(),
  quote: z.string().length(3).optional(),
  rate_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function maxFutureDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2);
  return d.toISOString().slice(0, 10);
}

async function lastApiRate(
  supabase: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  base: string,
  quote: string,
): Promise<number | null> {
  const { data } = await supabase
    .from("fx_reference_rates")
    .select("rate")
    .eq("base_currency", base)
    .eq("quote_currency", quote)
    .neq("source", "manual")
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.rate != null ? Number(data.rate) : null;
}

type AdminUser = { id: string; role: string };

async function auditOverrideRejected(
  user: AdminUser,
  reqMeta: ReturnType<typeof extractRequestMeta>,
  reason: string,
  metadata?: Record<string, unknown>,
) {
  await writeAuditLog({
    actor_user_id: user.id,
    actor_role: user.role,
    action: "finance.fx.override_rejected",
    module: "finance",
    risk_level: "medium",
    retention_tier: "financial",
    status: "failed",
    metadata: { reason, ...metadata },
    ip_address: reqMeta.ip_address,
    user_agent: reqMeta.user_agent,
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    bustFxRateMemo();
    const supabase = getSupabaseAdmin();
    const [coverage, cronRun, selfCheck, lastIngest] = await Promise.all([
      buildFxCoverageMatrix(supabase),
      fetchLastCronRun(supabase),
      runFxSelfCheck(),
      fetchLastIngestSummary(supabase),
    ]);

    const hasFallback = coverage.rows.some((r) => r.source === "open_er_api");

    const overall =
      coverage.requiredOk < coverage.requiredTotal
        ? "missing"
        : coverage.rows.some((r) => r.required && r.status === "stale")
          ? "stale"
          : "fresh";

    return successResponse({
      overall,
      coverage: coverage.rows,
      required_ok: coverage.requiredOk,
      required_total: coverage.requiredTotal,
      cron_run: cronRun,
      self_check: selfCheck,
      last_ingest: lastIngest,
      has_open_er_api_rows: hasFallback,
      reporting_only_notice:
        "Reporting only. Frankfurter public feed (no API key). PSP settlement amounts stay authoritative.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to load FX rates desk");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const payload = overrideSchema.safeParse(await request.json());
    const reqMeta = extractRequestMeta(request);

    if (!payload.success) {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: user.role,
        action: "finance.fx.override_rejected",
        module: "finance",
        risk_level: "medium",
        retention_tier: "financial",
        status: "failed",
        metadata: { issues: payload.error.issues },
        ip_address: reqMeta.ip_address,
        user_agent: reqMeta.user_agent,
      });
      return errorResponse("Invalid override payload", "VALIDATION_ERROR", 400, {
        issues: payload.error.issues,
      });
    }

    const base = payload.data.base.toUpperCase();
    const quote = payload.data.quote.toUpperCase();
    if (!ISO_4217.test(base) || !ISO_4217.test(quote)) {
      await auditOverrideRejected(user, reqMeta, "invalid_currency_codes", { base, quote });
      return errorResponse("Invalid currency codes", "VALIDATION_ERROR", 400);
    }

    const { data: currencyRow } = await supabase
      .from("currencies")
      .select("code")
      .eq("code", base)
      .eq("is_active", true)
      .maybeSingle();
    if (!currencyRow) {
      await auditOverrideRejected(user, reqMeta, "inactive_currency", { base });
      return errorResponse("Base currency not in active catalog", "VALIDATION_ERROR", 400);
    }

    const rateDate = payload.data.rate_date ?? new Date().toISOString().slice(0, 10);
    if (rateDate > maxFutureDate()) {
      await auditOverrideRejected(user, reqMeta, "rate_date_future", { rate_date: rateDate });
      return errorResponse("rate_date too far in the future", "VALIDATION_ERROR", 400);
    }

    let holdUntil = payload.data.hold_until ?? null;
    if (holdUntil) {
      const holdStart = new Date(`${rateDate}T12:00:00.000Z`);
      const holdEnd = new Date(`${holdUntil}T12:00:00.000Z`);
      const maxHold = new Date(holdStart);
      maxHold.setUTCDate(maxHold.getUTCDate() + 30);
      if (holdEnd > maxHold || holdEnd < holdStart) {
        await auditOverrideRejected(user, reqMeta, "hold_until_invalid", {
          rate_date: rateDate,
          hold_until: holdUntil,
        });
        return errorResponse("hold_until must be within 30 days of rate_date", "VALIDATION_ERROR", 400);
      }
    }

    const apiRef = await lastApiRate(supabase, base, quote);
    if (apiRef != null && !payload.data.confirm_outlier) {
      const low = apiRef * 0.5;
      const high = apiRef * 2;
      if (payload.data.rate < low || payload.data.rate > high) {
        await writeAuditLog({
          actor_user_id: user.id,
          actor_role: user.role,
          action: "finance.fx.override_rejected",
          module: "finance",
          risk_level: "medium",
          retention_tier: "financial",
          status: "failed",
          metadata: { base, quote, rate: payload.data.rate, api_ref: apiRef, reason: "outlier" },
          ip_address: reqMeta.ip_address,
          user_agent: reqMeta.user_agent,
        });
        return errorResponse(
          "Rate outside 0.5×–2× of last API rate. Pass confirm_outlier: true to proceed.",
          "OUTLIER_RATE",
          409,
          { api_ref: apiRef },
        );
      }
    }

    const { data: beforeRow } = await supabase
      .from("fx_reference_rates")
      .select("*")
      .eq("base_currency", base)
      .eq("quote_currency", quote)
      .eq("rate_date", rateDate)
      .eq("source", "manual")
      .maybeSingle();

    const insertRow = {
      rate_date: rateDate,
      base_currency: base,
      quote_currency: quote,
      rate: payload.data.rate,
      source: "manual",
      hold_until: holdUntil,
      note: payload.data.note.trim(),
      set_by: user.id,
      fetched_at: new Date().toISOString(),
    };

    const { data: afterRow, error } = await supabase
      .from("fx_reference_rates")
      .upsert(insertRow, {
        onConflict: "rate_date,base_currency,quote_currency,source",
      })
      .select("*")
      .single();

    if (error) throw error;

    bustFxRateMemo();

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "finance.fx.override",
      entity_type: "fx_reference_rate",
      entity_id: (afterRow as { id: string }).id,
      module: "finance",
      risk_level: "medium",
      retention_tier: "financial",
      metadata: {
        base,
        quote,
        rate: payload.data.rate,
        rate_date: rateDate,
        hold_until: holdUntil,
        note: payload.data.note,
        confirm_outlier: payload.data.confirm_outlier ?? false,
      },
      before_json: beforeRow ?? null,
      after_json: afterRow as Record<string, unknown>,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ row: afterRow });
  } catch (error) {
    return handleApiError(error, "Failed to save FX override");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const body = deleteSchema.safeParse(await request.json());
    const reqMeta = extractRequestMeta(request);

    if (!body.success) {
      return errorResponse("Invalid delete payload", "VALIDATION_ERROR", 400);
    }

    let existingQuery = supabase.from("fx_reference_rates").select("*").eq("source", "manual");
    if (body.data.id) {
      existingQuery = existingQuery.eq("id", body.data.id);
    } else if (body.data.base && body.data.quote && body.data.rate_date) {
      existingQuery = existingQuery
        .eq("base_currency", body.data.base.toUpperCase())
        .eq("quote_currency", body.data.quote.toUpperCase())
        .eq("rate_date", body.data.rate_date);
    } else {
      return errorResponse("Provide id or base+quote+rate_date", "VALIDATION_ERROR", 400);
    }

    const { data: existing } = await existingQuery.maybeSingle();

    let deleteQuery = supabase.from("fx_reference_rates").delete().eq("source", "manual");
    if (body.data.id) {
      deleteQuery = deleteQuery.eq("id", body.data.id);
    } else {
      deleteQuery = deleteQuery
        .eq("base_currency", body.data.base!.toUpperCase())
        .eq("quote_currency", body.data.quote!.toUpperCase())
        .eq("rate_date", body.data.rate_date!);
    }

    const { error } = await deleteQuery;
    if (error) throw error;

    bustFxRateMemo();

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "finance.fx.clear",
      module: "finance",
      risk_level: "medium",
      retention_tier: "financial",
      metadata: body.data,
      before_json: existing ?? null,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ cleared: true });
  } catch (error) {
    return handleApiError(error, "Failed to clear FX override");
  }
}
