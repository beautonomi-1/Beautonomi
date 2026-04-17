import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection,
  successResponse,
  notFoundResponse,
  handleApiError,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_ECOMMERCE } from "@/lib/admin-sections";
import { z } from "zod";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const resolveSchema = z.object({
  resolution: z.enum(["full_refund", "partial_refund", "replacement", "store_credit", "denied"]),
  admin_notes: z.string().max(1000).optional(),
  refund_processed_amount: z.number().min(0).optional(),
});

/**
 * GET /api/admin/product-returns/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);
    const supabase = await getSupabaseServer(request);

    const { data, error } = await supabase
      .from("product_return_requests")
      .select(
        `*,
        order:product_orders(*,items:product_order_items(*)),
        customer:users!product_return_requests_customer_id_fkey(id, full_name, email, phone),
        provider:providers(id, business_name, user_id)`,
      )
      .eq("id", id)
      .single();

    if (error || !data) return notFoundResponse("Return request not found");
    return successResponse({ return_request: data });
  } catch (err) {
    return handleApiError(err, "Failed to fetch return request");
  }
}

/**
 * PATCH /api/admin/product-returns/[id] — superadmin resolves escalated/any return
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);
    const body = await request.json();
    const parsed = resolveSchema.parse(body);
    const supabase = await getSupabaseServer(request);

    const { data: req } = await supabase
      .from("product_return_requests")
      .select("id, status, refund_amount")
      .eq("id", id)
      .single();

    if (!req) return notFoundResponse("Return request not found");

    const isRefund = ["full_refund", "partial_refund", "store_credit"].includes(parsed.resolution);

    const update: Record<string, unknown> = {
      status: isRefund ? "refunded" : "resolved_by_admin",
      resolution: parsed.resolution,
      admin_notes: parsed.admin_notes ?? null,
      resolved_by: user.id,
    };

    if (isRefund) {
      update.refunded_at = new Date().toISOString();
      update.refund_processed_amount =
        parsed.refund_processed_amount ?? Number(req.refund_amount);
      update.refund_method = "admin_override";
    }

    const { data, error } = await supabase
      .from("product_return_requests")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.product_return.resolve",
      entity_type: "product_return_request",
      entity_id: id,
      module: "ecommerce",
      risk_level: "high",
      retention_tier: "operational",
      metadata: { resolution: parsed.resolution },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ return_request: data });
  } catch (err) {
    return handleApiError(err, "Failed to resolve return request");
  }
}
