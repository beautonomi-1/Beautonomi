import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { importAppleSettlement } from "@/lib/iap/apple/settlement-import";

const bodySchema = z.object({
  report_text: z.string().min(1),
  region: z.string().min(2).max(8).optional(),
  tenant_id: z.string().uuid().optional(),
  bank_deposit: z.number().optional(),
  statement_reference: z.string().optional(),
  variance_tolerance: z.number().min(0).max(1000).optional(),
});

async function resolvePlatformTenantId(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<string> {
  const { data } = await supabase.from("tenants").select("id").eq("slug", "za").maybeSingle();
  if (!data?.id) {
    throw new Error("Default platform tenant (slug=za) is not configured");
  }
  return data.id as string;
}

/**
 * POST /api/admin/monetization/apple/settlements/import
 * Parse an Apple Financial Report export and upsert settlement reconciliation rows.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("Invalid request body", "VALIDATION_ERROR", 400, parsed.error.flatten());
    }

    const supabase = getSupabaseAdmin();
    const tenantId = parsed.data.tenant_id ?? (await resolvePlatformTenantId(supabase));

    const result = await importAppleSettlement({
      supabase,
      reportText: parsed.data.report_text,
      region: parsed.data.region ?? "ZA",
      tenantId,
      bankDeposit: parsed.data.bank_deposit ?? null,
      statementReference: parsed.data.statement_reference ?? null,
      createdBy: user.id,
      varianceTolerance: parsed.data.variance_tolerance,
    });

    return successResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
