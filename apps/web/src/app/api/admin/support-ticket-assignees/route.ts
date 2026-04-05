import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, handleApiError } from "@/lib/supabase/api-helpers";
import type { UserRole } from "@/types/beautonomi";
import {
  SUPPORT_TICKET_ASSIGNEE_ROLES,
  SUPPORT_TICKET_STAFF_ROLES,
} from "@/lib/support/support-ticket-staff";

/**
 * GET /api/admin/support-ticket-assignees
 * Users who may be assigned support tickets (for admin UI dropdown).
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);

    const roles = [...SUPPORT_TICKET_ASSIGNEE_ROLES] as string[];
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("users")
      .select("id, email, full_name, role")
      .in("role", roles)
      .order("full_name", { ascending: true, nullsFirst: false });

    if (error) throw error;

    return NextResponse.json({ assignees: data || [] });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to load assignees");
  }
}
