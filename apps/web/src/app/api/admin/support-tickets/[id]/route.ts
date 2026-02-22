import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const result = await requireRole(["superadmin", "support_agent"]);
    
    if (!result) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .select(`
        *,
        user:users(id, email, full_name),
        provider:providers(id, business_name),
        assigned_user:users!support_tickets_assigned_to_fkey(id, email, full_name)
      `)
      .eq("id", id)
      .single();

    if (error) throw error;

    // Get messages
    const { data: messages } = await supabase
      .from("support_ticket_messages")
      .select(`
        *,
        user:users(id, email, full_name)
      `)
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    // Get notes (only for admins/agents)
    const { data: notes } = await supabase
      .from("support_ticket_notes")
      .select(`
        *,
        user:users(id, email, full_name)
      `)
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      ticket,
      messages: messages || [],
      notes: notes || [],
    });
  } catch (error: any) {
    console.error("Error fetching support ticket:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch support ticket" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const result = await requireRole(["superadmin", "support_agent"]);
    
    if (!result) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const body = await request.json();
    const {
      status,
      priority,
      assigned_to,
      tags,
    } = body;

    const updateData: any = {};
    if (status !== undefined) {
      updateData.status = status;
      if (status === "resolved") {
        updateData.resolved_at = new Date().toISOString();
      }
      if (status === "closed") {
        updateData.closed_at = new Date().toISOString();
      }
    }
    if (priority !== undefined) updateData.priority = priority;
    if (assigned_to !== undefined) updateData.assigned_to = assigned_to;
    if (tags !== undefined) updateData.tags = tags;

    const { data, error } = await supabase
      .from("support_tickets")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ticket: data });
  } catch (error: any) {
    console.error("Error updating support ticket:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update support ticket" },
      { status: 500 }
    );
  }
}
