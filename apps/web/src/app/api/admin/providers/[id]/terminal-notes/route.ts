/**
 * GET  /api/admin/providers/:id/terminal-notes  — list notes (newest first)
 * POST /api/admin/providers/:id/terminal-notes  — add a note
 *
 * Used by Superadmin Terminal Insights provider drilldown.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const createNoteSchema = z.object({
  body: z.string().min(1).max(4000),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("terminal_admin_notes")
      .select("id, body, created_at, updated_at, author_id, users(full_name, email)")
      .eq("provider_id", params.id)
      .order("created_at", { ascending: false });

    if (error) {
      return errorResponse("Failed to load notes", "LOAD_ERROR", 500, error);
    }

    return successResponse({ notes: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal notes");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user: adminUser } = await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const supabase = getSupabaseAdmin();
    const providerId = params.id;

    const body = await request.json();
    const validation = createNoteSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validation.error.issues);
    }

    const { data: provRow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();

    if (!provRow) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const { data, error } = await supabase
      .from("terminal_admin_notes")
      .insert({
        tenant_id: (provRow as { tenant_id?: string }).tenant_id,
        provider_id: providerId,
        author_id: adminUser.id,
        body: validation.data.body,
      })
      .select()
      .single();

    if (error) {
      return errorResponse("Failed to save note", "SAVE_ERROR", 500, error);
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: adminUser.id,
      actor_role: adminUser.role ?? "superadmin",
      action: "admin.terminal_note.added",
      entity_type: "terminal_admin_notes",
      entity_id: (data as { id?: string }).id ?? providerId,
      module: "terminal_commerce",
      metadata: { provider_id: providerId },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ note: data });
  } catch (error) {
    return handleApiError(error, "Failed to save terminal note");
  }
}
