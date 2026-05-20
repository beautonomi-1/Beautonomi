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

async function loadGroupDetail(admin: ReturnType<typeof getSupabaseAdmin>, groupId: string, tenantId: string) {
  const { data, error } = await admin
    .from("group_bookings")
    .select(
      `
      *,
      providers!inner(id, business_name, tenant_id),
      service_packages:package_id(id, name),
      booking_participants(
        id,
        booking_id,
        customer_id,
        participant_name,
        participant_email,
        participant_phone,
        is_primary_contact,
        service_id,
        service_name,
        price,
        duration_minutes,
        checked_in_at,
        checked_out_at
      ),
      bookings:bookings(
        id,
        booking_number,
        customer_id,
        status,
        scheduled_at,
        total_amount,
        total_paid,
        total_refunded,
        payment_status,
        customer:users!bookings_customer_id_fkey(id, full_name, email, phone)
      )
    `
    )
    .eq("id", groupId)
    .eq("providers.tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    provider_name: (data as any).providers?.business_name ?? null,
    participants: ((data as any).booking_participants ?? []).map((p: any) => ({
      id: p.id,
      booking_id: p.booking_id ?? null,
      customer_id: p.customer_id ?? null,
      participant_name: p.participant_name ?? "Guest",
      participant_email: p.participant_email ?? null,
      participant_phone: p.participant_phone ?? null,
      is_primary_contact: Boolean(p.is_primary_contact),
      service_name: p.service_name ?? "Service",
      price: Number(p.price ?? 0),
      duration_minutes: p.duration_minutes ?? null,
      checked_in_at: p.checked_in_at ?? null,
      checked_out_at: p.checked_out_at ?? null,
    })),
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const admin = getSupabaseAdmin();
    const { id: rawId } = await params;
    const id = normalizeGroupBookingId(rawId);

    const detail = await loadGroupDetail(admin, id, tenantId);
    if (!detail) {
      return NextResponse.json({ data: null, error: { message: "Group booking not found", code: "NOT_FOUND" } }, { status: 404 });
    }

    return successResponse(detail);
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
