import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getMarketingBalance, creditMarketingBalance, debitMarketingBalance } from "@/lib/marketing/credits";
import { writeAuditLog } from "@/lib/audit/audit";

const grantSchema = z.object({
  amount_zar: z.coerce.number().refine((n) => n !== 0, "amount_zar cannot be zero"),
  note: z.string().optional(),
});

/**
 * GET /api/admin/providers/[id]/marketing-credits
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const { id: providerId } = await params;
    const supabase = getSupabaseAdmin();

    const { data: provider } = await supabase.from("providers").select("id").eq("id", providerId).maybeSingle();
    if (!provider) return notFoundResponse("Provider not found");

    const balance = await getMarketingBalance(supabase, providerId);

    const { data: ledger } = await supabase
      .from("marketing_credit_ledger")
      .select("id, delta_zar, reason, channel, balance_after, created_at, metadata")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .limit(50);

    return successResponse({ balance, ledger: ledger ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch provider marketing credits");
  }
}

/**
 * POST /api/admin/providers/[id]/marketing-credits — manual grant/adjustment.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const { id: providerId } = await params;
    const body = grantSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    const { data: provider } = await supabase.from("providers").select("id").eq("id", providerId).maybeSingle();
    if (!provider) return notFoundResponse("Provider not found");

    const idempotencyKey = `admin_adjustment:${providerId}:${Date.now()}`;
    const result =
      body.amount_zar > 0
        ? await creditMarketingBalance({
            providerId,
            amountZar: body.amount_zar,
            reason: "admin_adjustment",
            idempotencyKey,
            metadata: {
              note: body.note ?? null,
              admin_user_id: user.id,
            },
            supabase,
          })
        : await debitMarketingBalance({
            providerId,
            amountZar: Math.abs(body.amount_zar),
            reason: "admin_adjustment",
            idempotencyKey,
            metadata: {
              note: body.note ?? null,
              admin_user_id: user.id,
            },
            supabase,
          });

    if (!result.ok) {
      return handleApiError(
        new Error("reason" in result ? result.reason : "Adjustment failed"),
        "Failed to adjust marketing credits",
        "ADJUSTMENT_FAILED",
        400,
      );
    }

    const balance = await getMarketingBalance(supabase, providerId);

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.provider.marketing_credits.adjust",
      entity_type: "provider",
      entity_id: providerId,
      metadata: {
        amount_zar: body.amount_zar,
        note: body.note ?? null,
        balance_after: result.balance_after,
      },
    });

    return successResponse({ balance, balance_after: result.balance_after });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to grant marketing credits");
  }
}
