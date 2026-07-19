import { NextRequest, after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  requireRoleInApi,
  getOffsetPaginationParams,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import {
  notifySupportTicketCreated,
  notifySupportStaffInboxActivity,
  resolveSupportTicketStaffRecipients,
} from "@/lib/notifications/notification-service";
import { z } from "zod";
import { normalizeSupportTicketCategory } from "@/lib/support/ticket-categories";
import { computeSlaResolutionDueIso, computeFirstResponseDueIso } from "@/lib/support/support-ticket-sla";

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

/**
 * POST /api/me/support-tickets
 * 
 * Create a new support ticket
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const body = await request.json();
    const validated = createTicketSchema.parse(body);
    const category = normalizeSupportTicketCategory(validated.category);
    const requesterType =
      user.role === "provider_owner" || user.role === "provider_staff"
        ? "provider"
        : user.role === "superadmin"
          ? "admin"
          : "customer";

    const adminSupabase = getSupabaseAdmin();
    const providerId =
      requesterType === "provider"
        ? await getProviderIdForUser(user.id, adminSupabase as never, { request })
        : null;

    // Create support ticket (description NOT NULL: use first message; ticket_number set by DB trigger if omitted)
    const { data: ticket, error: ticketError } = await adminSupabase
      .from("support_tickets")
      .insert({
        user_id: user.id,
        subject: validated.subject,
        description: validated.message.slice(0, 10000) || "(No description)",
        priority: validated.priority,
        status: "open",
        category,
        provider_id: providerId,
        requester_type: requesterType,
        support_context_type: validated.support_context_type ?? null,
        support_context_id: validated.support_context_id ?? null,
        support_context_label: validated.support_context_label?.trim() || null,
      })
      .select()
      .single();

    if (ticketError) {
      throw ticketError;
    }

    const createdAt = ticket.created_at as string | undefined;
    if (createdAt) {
      await adminSupabase
        .from("support_tickets")
        .update({
          sla_resolution_due_at: computeSlaResolutionDueIso(createdAt, validated.priority),
          first_response_due_at: computeFirstResponseDueIso(createdAt, validated.priority),
        })
        .eq("id", ticket.id);
    }

    // Create initial message
    const { data: message, error: messageError } = await adminSupabase
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
      // If message creation fails, delete the ticket
      await adminSupabase.from("support_tickets").delete().eq("id", ticket.id);
      throw messageError;
    }

    await adminSupabase
      .from("support_tickets")
      .update({
        last_message_at: message.created_at,
        last_message_from: "customer",
        last_customer_view_at: message.created_at,
      })
      .eq("id", ticket.id);

    // Confirm to user via email (and push if enabled) that ticket was created
    try {
      await notifySupportTicketCreated(
        user.id,
        ticket.ticket_number || ticket.id,
        validated.subject,
        ticket.id,
        ["email", "push"],
        requesterType === "provider" ? "provider" : "customer"
      );
    } catch (notifyErr) {
      console.error("Support ticket created notification failed:", notifyErr);
    }

    try {
      const staffIds = await resolveSupportTicketStaffRecipients(null);
      await notifySupportStaffInboxActivity(
        staffIds,
        ticket.ticket_number || ticket.id,
        `New ticket: ${validated.subject.slice(0, 200)}`,
        ticket.id,
        ["email", "push"]
      );
    } catch (staffNotifyErr) {
      console.error("Support staff new-ticket notification failed:", staffNotifyErr);
    }

    // Agent triage runs after the response is sent: classifies the ticket,
    // drafts a first reply, and proposes assignment — all human-approved.
    after(async () => {
      try {
        const { runSupportTriageWorkflow } = await import("@/lib/agents/workflows/support-agent");
        await runSupportTriageWorkflow({ ticketId: ticket.id });
      } catch (triageErr) {
        console.error("Support triage workflow failed:", triageErr);
      }
    });

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
      console.error("Slack notification failed:", slackErr);
    }

    try {
      const { maybeOpenFraudCaseFromSafetyTicket } = await import(
        "@/lib/fraud/maybe-open-fraud-from-support-ticket"
      );
      await maybeOpenFraudCaseFromSafetyTicket({
        ticketId: ticket.id,
        category,
        userId: user.id,
        providerId,
        subject: validated.subject,
        message: validated.message,
        supabase: adminSupabase as never,
      });
    } catch (fraudErr) {
      console.error("Fraud case from safety ticket failed:", fraudErr);
    }

    return successResponse({
      ticket,
      initialMessage: message,
      message: "Support ticket created successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map(e => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to create support ticket");
  }
}

/**
 * GET /api/me/support-tickets
 * 
 * Get all support tickets for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 50, maxLimit: 100 });

    let query = supabase
      .from("support_tickets")
      .select(`
        id,
        ticket_number,
        subject,
        status,
        priority,
        category,
        requester_type,
        support_context_type,
        support_context_id,
        support_context_label,
        csat_score,
        csat_submitted_at,
        last_message_at,
        last_message_from,
        last_customer_view_at,
        created_at,
        updated_at
      `, { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: tickets, error, count } = await query;

    if (error) {
      throw error;
    }

    return successResponse({
      tickets: (tickets || []).map((ticket) => {
        const lastMessageAt = ticket.last_message_at ? new Date(String(ticket.last_message_at)).getTime() : 0;
        const lastSeenAt = ticket.last_customer_view_at ? new Date(String(ticket.last_customer_view_at)).getTime() : 0;
        return {
          ...ticket,
          has_unread_staff_reply:
            ticket.last_message_from === "staff" && lastMessageAt > Math.max(0, lastSeenAt),
        };
      }),
      total: count ?? 0,
      pagination: {
        limit,
        offset,
        has_more: offset + limit < (count ?? 0),
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch support tickets");
  }
}
