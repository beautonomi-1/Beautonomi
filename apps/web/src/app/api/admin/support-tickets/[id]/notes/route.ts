import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";

export async function POST(
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

    const { user } = result;
    const { id } = await params;

    const body = await request.json();
    const { note, is_private } = body;

    if (!note) {
      return NextResponse.json(
        { error: "Note is required" },
        { status: 400 }
      );
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
  } catch (error: any) {
    console.error("Error creating ticket note:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create note" },
      { status: 500 }
    );
  }
}
