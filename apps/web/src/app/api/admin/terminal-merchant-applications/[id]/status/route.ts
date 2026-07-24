import { NextRequest } from "next/server";
import { z } from "zod";
import {
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { logTerminalMerchantApplicationEvent } from "@/lib/terminal-merchant/events";
import {
  notifyTerminalMerchantApplicationInfoRequired,
  notifyTerminalMerchantApplicationTermSheetSent,
  notifyTerminalMerchantApplicationDeclined,
} from "@/lib/terminal-merchant/notifications";
import { slackNotifyTerminalMerchantTermSheetAccepted } from "@/lib/integrations/slack/terminal-merchant-triggers";
import { requireTerminalMerchantAdmin } from "@/lib/terminal-merchant/admin-auth";

const bodySchema = z
  .object({
    status: z
      .enum([
        "draft",
        "submitted",
        "in_review",
        "info_required",
        "sent_to_acquirer",
        "awaiting_term_sheet",
        "declined",
        "cancelled",
      ])
      .optional(),
    info_required_sections: z.array(z.string()).optional(),
    info_required_reason: z.string().optional(),
    decline_reason: z.string().optional(),
    term_sheet_status: z.enum(["pending", "sent", "accepted", "declined", "expired"]).optional(),
    acquirer_reference: z.string().optional(),
    assigned_admin_id: z.string().uuid().nullable().optional(),
    create_support_ticket: z.boolean().optional(),
  })
  .refine((data) => data.status != null || data.term_sheet_status != null, {
    message: "status or term_sheet_status is required",
  });

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/terminal-merchant-applications/[id]/status
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireTerminalMerchantAdmin(request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);
    }

    const { data: application } = await supabase
      .from("terminal_merchant_applications")
      .select("*, providers(id, business_name, user_id, tenant_id), support_ticket_id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!application) return errorResponse("Application not found", "NOT_FOUND", 404);

    const nextStatus = parsed.data.status ?? (application as { status: string }).status;
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      updated_at: now,
    };
    if (parsed.data.status) update.status = parsed.data.status;
    if (parsed.data.assigned_admin_id !== undefined) update.assigned_admin_id = parsed.data.assigned_admin_id;
    if (parsed.data.acquirer_reference !== undefined) update.acquirer_reference = parsed.data.acquirer_reference;

    if (nextStatus === "info_required") {
      update.info_required_sections = parsed.data.info_required_sections ?? [];
      update.info_required_reason = parsed.data.info_required_reason ?? null;
    }
    if (nextStatus === "declined") {
      update.decline_reason = parsed.data.decline_reason ?? null;
    }
    if (nextStatus === "awaiting_term_sheet" || parsed.data.term_sheet_status === "sent") {
      update.term_sheet_status = "sent";
      update.term_sheet_sent_at = now;
    }
    if (parsed.data.term_sheet_status === "accepted") {
      update.term_sheet_status = "accepted";
      update.term_sheet_accepted_at = now;
    }

    let supportTicketId = (application as { support_ticket_id?: string | null }).support_ticket_id ?? null;
    if (
      parsed.data.create_support_ticket &&
      nextStatus === "info_required" &&
      !supportTicketId &&
      (application as { providers?: { user_id?: string } }).providers?.user_id
    ) {
      const provider = (application as { providers?: { user_id?: string; business_name?: string; tenant_id?: string } })
        .providers!;
      const { createSupportTicketForProvider } = await import("@/lib/terminal-merchant/support-ticket");
      supportTicketId = await createSupportTicketForProvider(supabase, {
        providerId: (application as { provider_id: string }).provider_id,
        userId: provider.user_id!,
        tenantId,
        applicationId: id,
        applicationNo: (application as { application_no: string }).application_no,
        subject: `Card machine application ${(application as { application_no: string }).application_no} — info needed`,
        initialMessage: parsed.data.info_required_reason ?? "We need a few updates on your application.",
      });
      if (supportTicketId) update.support_ticket_id = supportTicketId;
    }

    const { data: updated, error } = await supabase
      .from("terminal_merchant_applications")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    await logTerminalMerchantApplicationEvent(supabase, {
      applicationId: id,
      eventType: "status_change",
      actorUserId: user.id,
      actorRole: user.role ?? "admin",
      message: parsed.data.status ? `Status → ${parsed.data.status}` : `Term sheet → ${parsed.data.term_sheet_status}`,
      payload: parsed.data,
    });

    const provider = (application as { providers?: { business_name?: string; user_id?: string; tenant_id?: string } })
      .providers;

    if (provider?.user_id) {
      const base = {
        userId: provider.user_id,
        tenantId: provider.tenant_id,
        businessName: provider.business_name ?? "Provider",
        applicationNo: updated.application_no,
        applicationId: updated.id,
      };
      if (parsed.data.status === "info_required") {
        await notifyTerminalMerchantApplicationInfoRequired({
          ...base,
          infoReason: parsed.data.info_required_reason ?? "Please review your application.",
        });
      }
      if (parsed.data.term_sheet_status === "sent" || update.term_sheet_status === "sent") {
        await notifyTerminalMerchantApplicationTermSheetSent({
          ...base,
          otpPhone: updated.otp_phone ?? updated.phone ?? "your phone",
        });
      }
      if (parsed.data.term_sheet_status === "accepted") {
        await slackNotifyTerminalMerchantTermSheetAccepted(request, updated as any, provider);
      }
      if (parsed.data.status === "declined") {
        await notifyTerminalMerchantApplicationDeclined({
          ...base,
          declineReason: parsed.data.decline_reason ?? "Unable to approve at this time.",
        });
      }
    }

    return successResponse({ application: updated });
  } catch (error) {
    return handleApiError(error, "Failed to update application status");
  }
}
