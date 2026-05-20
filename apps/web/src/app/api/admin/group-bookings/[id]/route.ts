import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  requireAdminSection,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { evaluateGroupCapacity, normalizeGroupCapacity } from "@/lib/bookings/group-capacity";
import { ADMIN_GROUP_DETAIL_SELECT } from "@/lib/bookings/group-booking-postgrest";

function normalizeGroupBookingId(rawId: string): string {
  return rawId.startsWith("group:") ? rawId.slice("group:".length) : rawId;
}

async function assertAdminCanAccessGroup(admin: ReturnType<typeof getSupabaseAdmin>, groupId: string, tenantId: string) {
  const { data, error } = await admin
    .from("group_bookings")
    .select("id, provider_id, status, providers!inner(id, business_name, tenant_id)")
    .eq("id", groupId)
    .eq("providers.tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  return data as ({ id: string; provider_id: string; status?: string | null } & Record<string, unknown>) | null;
}

function mapParticipants(raw: unknown) {
  const rows = Array.isArray(raw) ? raw : [];
  return rows.map((p: Record<string, unknown>) => ({
    id: p.id as string,
    booking_id: (p.booking_id as string | null) ?? null,
    participant_name: (p.participant_name as string) ?? "Guest",
    participant_email: (p.participant_email as string | null) ?? null,
    participant_phone: (p.participant_phone as string | null) ?? null,
    is_primary_contact: Boolean(p.is_primary_contact),
    service_name: (p.service_name as string) ?? "Service",
    price: Number(p.price ?? 0),
    duration_minutes: (p.duration_minutes as number | null) ?? null,
    checked_in_at: (p.checked_in_at as string | null) ?? null,
    checked_out_at: (p.checked_out_at as string | null) ?? null,
  }));
}

/**
 * Rich detail select after tenant access is verified.
 * Avoids `bookings:bookings` (ambiguous with primary_contact_booking_id FK)
 * and `providers.tenant_id` filters on nested embeds (PostgREST 500s).
 */
async function loadGroupDetail(admin: ReturnType<typeof getSupabaseAdmin>, groupId: string) {
  const { data, error } = await admin
    .from("group_bookings")
    .select(ADMIN_GROUP_DETAIL_SELECT)
    .eq("id", groupId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as Record<string, unknown> & {
    providers?: { business_name?: string | null } | null;
    booking_participants?: unknown;
    ref_number?: string | null;
    title?: string | null;
    status?: string | null;
    scheduled_at?: string | null;
    provider_id?: string | null;
    max_participants?: number | null;
    total_price?: number | null;
  };
  const participants = mapParticipants(row.booking_participants);

  return {
    ...row,
    ref_number: row.ref_number ?? groupId,
    title: row.title ?? "Group booking",
    status: row.status ?? "confirmed",
    provider_name: row.providers?.business_name ?? null,
    participant_count: participants.length,
    max_participants: Number(row.max_participants ?? 0) || null,
    total_price: Number(row.total_price ?? 0),
    participants,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const admin = getSupabaseAdmin();
    const { id: rawId } = await params;
    const id = normalizeGroupBookingId(rawId);

    const access = await assertAdminCanAccessGroup(admin, id, tenantId);
    if (!access) {
      return NextResponse.json(
        { data: null, error: { message: "Group booking not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    try {
      const detail = await loadGroupDetail(admin, id);
      if (!detail) {
        return NextResponse.json(
          { data: null, error: { message: "Group booking not found", code: "NOT_FOUND" } },
          { status: 404 }
        );
      }
      return successResponse(detail);
    } catch (detailError) {
      console.error("[admin group GET] detail select failed:", detailError);
      return errorResponse(
        "Group booking exists but its detail view could not be loaded. Please refresh and try again.",
        "GROUP_BOOKING_DETAIL_FAILED",
        500,
        {
          db:
            detailError instanceof Error
              ? detailError.message
              : typeof detailError === "object" && detailError !== null && "message" in detailError
                ? String((detailError as { message: unknown }).message)
                : null,
        }
      );
    }
  } catch (error) {
    return handleApiError(error, "Failed to fetch group booking");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const admin = getSupabaseAdmin();
    const { id: rawId } = await params;
    const id = normalizeGroupBookingId(rawId);
    const body = await request.json().catch(() => ({}));

    const group = await assertAdminCanAccessGroup(admin, id, tenantId);
    if (!group) return errorResponse("Group booking not found", "NOT_FOUND", 404);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of ["title", "notes", "status", "max_participants"] as const) {
      if (key in body) patch[key] = body[key];
    }
    if ("max_participants" in patch) {
      patch.max_participants = normalizeGroupCapacity(patch.max_participants);
    }
    if ("max_participants" in patch) {
      const { count, error: participantCountError } = await admin
        .from("booking_participants")
        .select("id", { count: "exact", head: true })
        .eq("group_booking_id", id);
      if (participantCountError) throw participantCountError;
      const capacity = evaluateGroupCapacity({
        maxParticipants: patch.max_participants,
        currentParticipants: count ?? 0,
      });
      if (capacity.ok === false) {
        return errorResponse(
          `Capacity cannot be lower than the current participant count (${capacity.current}).`,
          capacity.code,
          400
        );
      }
    }

    const { data, error } = await admin
      .from("group_bookings")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update group booking");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const admin = getSupabaseAdmin();
    const { id: rawId } = await params;
    const id = normalizeGroupBookingId(rawId);
    const action = new URL(request.url).searchParams.get("action") ?? "";
    const group = await assertAdminCanAccessGroup(admin, id, tenantId);
    if (!group) return errorResponse("Group booking not found", "NOT_FOUND", 404);

    const now = new Date().toISOString();
    if (action === "start_service") {
      await admin.from("bookings").update({ status: "in_progress", updated_at: now }).eq("group_booking_id", id).not("status", "in", "(cancelled,no_show,completed)");
      const { data, error } = await admin.from("group_bookings").update({ status: "started", updated_at: now }).eq("id", id).select().single();
      if (error) throw error;
      return successResponse({ group_booking: data });
    }

    if (action === "complete_service") {
      await admin.from("bookings").update({ status: "completed", completed_at: now, updated_at: now }).eq("group_booking_id", id).not("status", "in", "(cancelled,no_show,completed)");
      const { data, error } = await admin.from("group_bookings").update({ status: "completed", updated_at: now }).eq("id", id).select().single();
      if (error) throw error;
      return successResponse({ group_booking: data });
    }

    return errorResponse("Unsupported group booking action", "UNSUPPORTED_ACTION", 400);
  } catch (error) {
    return handleApiError(error, "Failed to apply group booking action");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const admin = getSupabaseAdmin();
    const { id: rawId } = await params;
    const id = normalizeGroupBookingId(rawId);
    const group = await assertAdminCanAccessGroup(admin, id, tenantId);
    if (!group) return errorResponse("Group booking not found", "NOT_FOUND", 404);

    const now = new Date().toISOString();
    await admin.from("bookings").update({ status: "cancelled", cancelled_at: now, cancellation_reason: "Group booking cancelled by admin", updated_at: now }).eq("group_booking_id", id).not("status", "in", "(cancelled,no_show)");
    const { error } = await admin.from("group_bookings").update({ status: "cancelled", updated_at: now }).eq("id", id);
    if (error) throw error;

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to cancel group booking");
  }
}
