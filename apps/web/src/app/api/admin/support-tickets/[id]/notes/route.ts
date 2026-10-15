import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, handleApiError } from "@/lib/supabase/api-helpers";
import type { UserRole } from "@/types/beautonomi";
import { SUPPORT_TICKET_STAFF_ROLES } from "@/lib/support/support-ticket-staff";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);
    const supabase = getSupabaseAdmin();
    const { id } = await params;

    const body = await request.json();
    const { note, is_private } = body;

    if (!note) {
      return NextResponse.json(
        { error: "Note is required" },
        { status: 400 }
      );
    }

    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("id, tenant_id")
      .eq("id", id)
      .maybeSingle();
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    const { staffCanAccessSupportTicket } = await import("@/lib/support/assert-staff-ticket-access");
    const allowed = await staffCanAccessSupportTicket(supabase, {
      role: user.role,
      userId: user.id,
      tenantId: (ticket as { tenant_id?: string | null }).tenant_id,
    });
    if (!allowed) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("support_ticket_notes")
      .insert({
        ticket_id: id,
        user_id: user.id,
        note,
        is_private: is_private !== false,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ note: data });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to create note");
  }
}
