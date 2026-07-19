import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/fraud-cases
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    let query = supabase
      .from("fraud_cases")
      .select(
        "id, status, risk_score, created_at, updated_at, tenant_id, subject_user_id, subject_provider_id, payment_provider, payment_reference, signals, decision, assigned_to, idempotency_key",
        { count: "exact" },
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: rows, error, count } = await query;
    if (error) throw error;

    type Row = {
      id: string;
      subject_user_id?: string | null;
      subject_provider_id?: string | null;
      assigned_to?: string | null;
      signals?: Record<string, unknown> | null;
    };

    const userIds = [
      ...new Set(
        (rows ?? []).flatMap((r: Row) =>
          [r.subject_user_id, r.assigned_to].filter(Boolean) as string[],
        ),
      ),
    ];
    const providerIds = [
      ...new Set((rows ?? []).map((r: Row) => r.subject_provider_id).filter(Boolean) as string[]),
    ];

    let userMap: Record<string, { id: string; full_name: string | null; email: string }> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", userIds);
      userMap = (users ?? []).reduce(
        (acc, u) => {
          acc[u.id] = u;
          return acc;
        },
        {} as typeof userMap,
      );
    }

    let providerMap: Record<string, { id: string; business_name: string | null }> = {};
    if (providerIds.length > 0) {
      const { data: providers } = await supabase
        .from("providers")
        .select("id, business_name")
        .in("id", providerIds);
      providerMap = (providers ?? []).reduce(
        (acc, p) => {
          acc[p.id] = p;
          return acc;
        },
        {} as typeof providerMap,
      );
    }

    const data = (rows ?? []).map((r: Row) => {
      const signals = (r.signals ?? {}) as Record<string, unknown>;
      const signalKind = String(signals.signal ?? signals.kind ?? "");
      return {
        ...r,
        signal_kind: signalKind || null,
        subject_user: r.subject_user_id ? userMap[r.subject_user_id] ?? null : null,
        subject_provider: r.subject_provider_id ? providerMap[r.subject_provider_id] ?? null : null,
        assigned_user: r.assigned_to ? userMap[r.assigned_to] ?? null : null,
      };
    });

    return successResponse({
      data,
      total: count ?? data.length,
      has_more: offset + limit < (count ?? data.length),
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to list fraud cases");
  }
}
