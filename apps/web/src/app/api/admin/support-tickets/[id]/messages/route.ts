import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";
import { notifySupportTicketUpdated } from "@/lib/notifications/notification-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServer(request);
    const result = await requireRole([
      "superadmin",
      "support_agent",
      "customer",
      "provider_owner",
    ]);

    if (!result) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { user } = result;
    const { id } = await params;

    const body = await request.json();
    const { message, is_internal, attachments } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const isInternal = is_internal === true;

    // Verify user has access to this ticket and get details for notification
    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("user_id, provider_id, ticket_number, subject")
      .eq("id", id)
      .single();

    if (!ticket) {
      return NextResponse.json(
        { error: "Ticket not found" },
        { status: 404 }
      );
    }

    // Check access
    const isAdmin = user.role === "superadmin" || user.role === "support_agent";
    const isOwner = ticket.user_id === user.id;

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("support_ticket_messages")
      .insert({
        ticket_id: id,
        user_id: user.id,
        message,
        is_internal: isInternal,
        attachments: attachments || [],
      })
      .select()
      .single();

    if (error) throw error;

    // Update ticket updated_at
    await supabase
      .from("support_tickets")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);

    // When admin/support_agent replies with a public message, notify the ticket owner (email + in-app for swift communication)
    if (!isInternal && isAdmin && ticket.user_id) {
      try {
        await notifySupportTicketUpdated(
          ticket.user_id,
          ticket.ticket_number || id,
          `Support replied: ${message.slice(0, 200)}${message.length > 200 ? "…" : ""}`,
          id,
          ["email", "push"]
        );
      } catch (notifyErr) {
        console.error("Support ticket reply notification failed:", notifyErr);
      }
    }

    return NextResponse.json({ message: data });
  } catch (error: any) {
    console.error("Error creating ticket message:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create message" },
      { status: 500 }
    );
  }
}
