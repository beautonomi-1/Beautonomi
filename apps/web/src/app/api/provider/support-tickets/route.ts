import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  getOffsetPaginationParams,
  getProviderIdForUser,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import {
  notifySupportStaffInboxActivity,
  notifySupportTicketCreated,
  resolveSupportTicketStaffRecipients,
} from "@/lib/notifications/notification-service";
import { normalizeSupportTicketCategory } from "@/lib/support/ticket-categories";
import { computeSlaResolutionDueIso, computeFirstResponseDueIso } from "@/lib/support/support-ticket-sla";
import {
  PROVIDER_SUPPORT_TICKET_LIST_SELECT,
  withUnreadSupportFlag,
} from "@/lib/support/provider-support-ticket-access";

const createTicketSchema = z.object({
  subject: z.string().min(1, "Subject is required").max(200, "Subject too long"),
  message: z.string().min(1, "Message is required").max(5000, "Message too long"),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium"),
  category: z.string().max(120).optional(),
  support_context_type: z
    .enum(["booking", "product_order", "gift_card", "payment", "provider_onboarding", "account", "technical", "other"])
    .optional(),
  support_context_id: z.string().uuid().optional().nullable(),
  support_context_label: z.string().max(160).optional().nullable(),
});

async function resolveProviderIdForRequest(request: NextRequest, userId: string) {
  const admin = getSupabaseAdmin();
  const providerId = await getProviderIdForUser(userId, admin as never, { request });
  return { admin, providerId };
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { admin, providerId } = await resolveProviderIdForRequest(request, user.id);
    if (!providerId) {
      return errorResponse("Provider access is required", "FORBIDDEN", 403);
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 50, maxLimit: 100 });

    let query = admin
      .from("support_tickets")
      .select(PROVIDER_SUPPORT_TICKET_LIST_SELECT, { count: "exact" })
      .eq("provider_id", providerId)
      .eq("requester_type", "provider")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: tickets, error, count } = await query;
    if (error) throw error;

    return successResponse({
      tickets: (tickets || []).map((ticket) => withUnreadSupportFlag(ticket)),
      total: count ?? 0,
      pagination: {
        limit,
        offset,
        has_more: offset + limit < (count ?? 0),
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch provider support tickets");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const validated = createTicketSchema.parse(await request.json());
    const { admin, providerId } = await resolveProviderIdForRequest(request, user.id);
    if (!providerId) {
      return errorResponse("Provider access is required", "FORBIDDEN", 403);
    }

    const category = normalizeSupportTicketCategory(validated.category);
    const { data: ticket, error: ticketError } = await admin
      .from("support_tickets")
      .insert({
        user_id: user.id,
        provider_id: providerId,
        subject: validated.subject,
        description: validated.message.slice(0, 10000) || "(No description)",
        priority: validated.priority,
        status: "open",
        category,
        requester_type: "provider",
        support_context_type: validated.support_context_type ?? null,
        support_context_id: validated.support_context_id ?? null,
        support_context_label: validated.support_context_label?.trim() || null,
      })
      .select()
      .single();

    if (ticketError) throw ticketError;

    const createdAt = ticket.created_at as string | undefined;
    if (createdAt) {
      await admin
        .from("support_tickets")
        .update({
          sla_resolution_due_at: computeSlaResolutionDueIso(createdAt, validated.priority),
          first_response_due_at: computeFirstResponseDueIso(createdAt, validated.priority),
        })
        .eq("id", ticket.id);
    }

    const { data: message, error: messageError } = await admin
      .from("support_ticket_messages")
      .insert({
        ticket_id: ticket.id,
        user_id: user.id,
        message: validated.message,
        is_internal: false,
      })
      .select()
      .single();

    if (messageError) {
      await admin.from("support_tickets").delete().eq("id", ticket.id);
      throw messageError;
    }

    await admin
      .from("support_tickets")
      .update({
        last_message_at: message.created_at,
        last_message_from: "customer",
        last_customer_view_at: message.created_at,
      })
      .eq("id", ticket.id);

    try {
      await notifySupportTicketCreated(
        user.id,
        ticket.ticket_number || ticket.id,
        validated.subject,
        ticket.id,
        ["email", "push"],
        "provider",
      );
    } catch (notifyErr) {
      console.error("Provider support ticket created notification failed:", notifyErr);
    }

    try {
      const staffIds = await resolveSupportTicketStaffRecipients(null);
      await notifySupportStaffInboxActivity(
        staffIds,
        ticket.ticket_number || ticket.id,
        `New provider ticket: ${validated.subject.slice(0, 200)}`,
        ticket.id,
        ["email", "push"],
      );
    } catch (staffNotifyErr) {
      console.error("Support staff new provider ticket notification failed:", staffNotifyErr);
    }

    try {
      const { slackNotifyNewSupportTicket } = await import("@/lib/integrations/slack/triggers");
      await slackNotifyNewSupportTicket(request, ticket as {
        id: string;
        ticket_number?: string;
        subject?: string;
        priority?: string;
        requester_type?: string;
        support_context_type?: string;
        support_context_label?: string;
      });
    } catch (slackErr) {
      console.error("Slack provider support ticket notification failed:", slackErr);
    }

    return successResponse({
      ticket,
      initialMessage: message,
      message: "Support ticket created successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400,
      );
    }
    return handleApiError(error, "Failed to create provider support ticket");
  }
}
