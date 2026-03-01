import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, requireAuthInApi } from "@/lib/supabase/api-helpers";
import { notifySupportTicketCreated } from "@/lib/notifications/notification-service";
import { z } from "zod";

const createTicketSchema = z.object({
  subject: z.string().min(1, "Subject is required").max(200, "Subject too long"),
  message: z.string().min(1, "Message is required").max(5000, "Message too long"),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
  category: z.string().optional(),
});

/**
 * POST /api/me/support-tickets
 * 
 * Create a new support ticket
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const body = await request.json();
    const validated = createTicketSchema.parse(body);

    const adminSupabase = getSupabaseAdmin();

    // Create support ticket (description NOT NULL: use first message; ticket_number set by DB trigger if omitted)
    const { data: ticket, error: ticketError } = await adminSupabase
      .from("support_tickets")
      .insert({
        user_id: user.id,
        subject: validated.subject,
        description: validated.message.slice(0, 10000) || "(No description)",
        priority: validated.priority,
        status: "open",
        category: validated.category || "general",
      })
      .select()
      .single();

    if (ticketError) {
      throw ticketError;
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

    // Confirm to user via email (and push if enabled) that ticket was created
    try {
      await notifySupportTicketCreated(
        user.id,
        ticket.ticket_number || ticket.id,
        validated.subject,
        ticket.id,
        ["email", "push"]
      );
    } catch (notifyErr) {
      console.error("Support ticket created notification failed:", notifyErr);
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
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = supabase
      .from("support_tickets")
      .select(`
        id,
        ticket_number,
        subject,
        status,
        priority,
        category,
        created_at,
        updated_at,
        support_ticket_messages (
          id,
          message,
          is_internal,
          created_at
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: tickets, error } = await query;

    if (error) {
      throw error;
    }

    return successResponse({
      tickets: tickets || [],
      total: tickets?.length || 0,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch support tickets");
  }
}
