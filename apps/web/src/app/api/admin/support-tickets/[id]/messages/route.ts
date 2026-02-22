import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
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

    // Verify user has access to this ticket
    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("user_id, provider_id")
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
        is_internal: is_internal || false,
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

    return NextResponse.json({ message: data });
  } catch (error: any) {
    console.error("Error creating ticket message:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create message" },
      { status: 500 }
    );
  }
}
