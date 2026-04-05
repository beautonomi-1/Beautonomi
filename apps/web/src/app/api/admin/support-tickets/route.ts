import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError } from "@/lib/supabase/api-helpers";
import type { UserRole } from "@/types/beautonomi";
import { SUPPORT_TICKET_STAFF_ROLES } from "@/lib/support/support-ticket-staff";

function sanitizeIlikeTerm(raw: string) {
  // Strip PostgREST/or filter metacharacters so q cannot break `.or(...)`.
  return raw.trim().replace(/[%_\\,]/g, "");
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer(request);
    await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const category = searchParams.get("category");
    const assignedTo = searchParams.get("assigned_to");
    const userId = searchParams.get("user_id");
    const q = sanitizeIlikeTerm(searchParams.get("q") || "");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "25", 10) || 25, 1), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);

    let query = supabase
      .from("support_tickets")
      .select(
        `
        *,
        user:users!support_tickets_user_id_fkey(id, email, full_name),
        provider:providers(id, business_name),
        assigned_user:users!support_tickets_assigned_to_fkey(id, email, full_name)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (priority) {
      query = query.eq("priority", priority);
    }

    if (category) {
      query = query.eq("category", category);
    }

    if (assignedTo === "unassigned") {
      query = query.is("assigned_to", null);
    } else if (assignedTo) {
      query = query.eq("assigned_to", assignedTo);
    }

    if (userId) {
      query = query.eq("user_id", userId);
    }

    if (q.length > 0) {
      const pattern = `%${q}%`;
      query = query.or(`subject.ilike.${pattern},ticket_number.ilike.${pattern}`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      tickets: data || [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to fetch support tickets");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer(request);
    const { user } = await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);

    const body = await request.json();
    const {
      subject,
      description,
      category,
      priority,
      provider_id,
    } = body;

    if (!subject || !description) {
      return NextResponse.json(
        { error: "Subject and description are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("support_tickets")
      .insert({
        user_id: user.id,
        provider_id: provider_id || null,
        subject,
        description,
        category: category || null,
        priority: priority || "medium",
        status: "open",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ticket: data });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to create support ticket");
  }
}
