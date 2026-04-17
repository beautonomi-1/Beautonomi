import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, notFoundResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { isValidAdminBookingStatusTransition } from "@/lib/bookings/booking-status-transitions";

/** Embedded relations aligned with provider booking detail (variants, package, fees, tips, add-ons). */
const ADMIN_BOOKING_DETAIL_SELECT = `
  *,
  customer:users!bookings_customer_id_fkey(id, full_name, email, phone, avatar_url),
  provider:providers!bookings_provider_id_fkey(id, business_name, slug, email, phone),
  location:provider_locations(id, name, address_line1, city, country),
  service_packages!bookings_package_id_fkey(id, name),
  group_bookings!bookings_group_booking_id_fkey(ref_number),
  booking_services(
    id,
    offering_id,
    staff_id,
    duration_minutes,
    price,
    currency,
    customization,
    guest_name,
    scheduled_start_at,
    scheduled_end_at,
    offerings:offerings!booking_services_offering_id_fkey(id, title, variant_name, parent_service_id, service_type),
    staff:provider_staff(id, name, role)
  ),
  booking_products(
    id,
    product_id,
    product_variant_id,
    quantity,
    unit_price,
    total_price,
    notes,
    products:products!booking_products_product_id_fkey(id, name, retail_price),
    product_variant:product_variants(id, option_values)
  ),
  booking_addons(
    id,
    addon_id,
    addon_name,
    quantity,
    price
  ),
  additional_charges(
    id,
    description,
    amount,
    currency,
    status,
    requested_at,
    paid_at
  ),
  booking_tip_allocations(
    id,
    staff_id,
    amount,
    staff:provider_staff(id, name)
  )
`;

async function loadAdminBookingPayload(
  supabase: SupabaseClient,
  id: string,
  tenantId: string
): Promise<{ data: Record<string, unknown> | null; error: unknown }> {
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(ADMIN_BOOKING_DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !booking) {
    return { data: null, error };
  }

  const { data: transaction } = await supabase
    .from("payment_transactions")
    .select("*")
    .eq("booking_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: {
      ...(booking as Record<string, unknown>),
      payment_transaction: transaction ?? null,
    },
    error: null,
  };
}

/**
 * GET /api/admin/bookings/[id]
 *
 * Get detailed booking information. Uses admin client so superadmin always sees any booking.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);

    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: payload, error } = await loadAdminBookingPayload(supabase, id, tenantId);
    if (error || !payload) {
      return notFoundResponse("Booking not found");
    }

    return successResponse(payload);
  } catch (error) {
    return handleApiError(error, "Failed to fetch booking");
  }
}

/**
 * PATCH /api/admin/bookings/[id]
 *
 * Update booking details
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    // Verify booking exists
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (!booking) {
      return notFoundResponse("Booking not found");
    }

    const currentStatus = (booking as { status?: string }).status ?? "";
    if (
      body.status !== undefined &&
      body.status !== currentStatus &&
      !isValidAdminBookingStatusTransition(currentStatus, String(body.status))
    ) {
      return errorResponse(
        `Cannot transition booking from ${currentStatus} to ${String(body.status)}`,
        "INVALID_STATUS_TRANSITION",
        400
      );
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.status !== undefined) updateData.status = body.status;
    if (body.scheduled_at !== undefined) updateData.scheduled_at = body.scheduled_at;
    if (body.location_id !== undefined) updateData.location_id = body.location_id;
    if (body.location_type !== undefined) updateData.location_type = body.location_type;
    if (body.address_line1 !== undefined) updateData.address_line1 = body.address_line1;
    if (body.address_line2 !== undefined) updateData.address_line2 = body.address_line2;
    if (body.address_city !== undefined) updateData.address_city = body.address_city;
    else if (body.city !== undefined) updateData.address_city = body.city;
    if (body.address_state !== undefined) updateData.address_state = body.address_state;
    if (body.address_postal_code !== undefined) updateData.address_postal_code = body.address_postal_code;
    if (body.address_country !== undefined) updateData.address_country = body.address_country;
    else if (body.country !== undefined) updateData.address_country = body.country;
    if (body.total_amount !== undefined) updateData.total_amount = body.total_amount;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.admin_notes !== undefined) updateData.admin_notes = body.admin_notes;
    if (body.payment_status !== undefined) updateData.payment_status = body.payment_status;

    // Provider reassignment (admin-only — verify target provider exists in same tenant)
    if (body.provider_id !== undefined) {
      const { data: targetProvider } = await supabase
        .from("providers")
        .select("id, tenant_id, status")
        .eq("id", body.provider_id)
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .maybeSingle();
      if (!targetProvider) {
        return errorResponse("Target provider not found or not active in this tenant", "INVALID_PROVIDER", 400);
      }
      updateData.provider_id = body.provider_id;
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update(updateData)
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (updateError) {
      return handleApiError(updateError, "Failed to update booking");
    }

    const { data: updatedPayload, error: reloadError } = await loadAdminBookingPayload(supabase, id, tenantId);
    if (reloadError || !updatedPayload) {
      return handleApiError(reloadError ?? new Error("Failed to reload booking"), "Failed to update booking");
    }

    // Notify customer if status changed
    if (body.status && body.status !== (booking as { status?: string }).status) {
      try {
        const { sendToUser } = await import("@/lib/notifications/onesignal");
        const { data: bookingData } = await supabase
          .from("bookings")
          .select("customer_id, booking_number")
          .eq("id", id)
          .eq("tenant_id", tenantId)
          .single();

        if (bookingData) {
          const bd = bookingData as { customer_id?: string; booking_number?: string };
          if (bd.customer_id) {
            await sendToUser(
              bd.customer_id,
              {
                title: "Booking Updated",
                message: `Your booking ${bd.booking_number ?? ""} has been updated.`,
                data: {
                  type: "booking_updated",
                  booking_id: id,
                },
                url: `/account-settings/bookings/${id}`,
              },
              ["push"],
              { appType: "customer" }
            );
          }
        }
      } catch (notifError) {
        console.error("Error sending notification:", notifError);
      }
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: admin.id,
      actor_role: admin.role,
      action: "admin.booking.update",
      entity_type: "booking",
      entity_id: id,
      module: "providers_operations",
      risk_level: "high",
      retention_tier: "operational",
      status: "succeeded",
      before_json: { status: (booking as { status?: string }).status },
      after_json: updateData,
      changed_fields: Object.keys(updateData).filter((k) => k !== "updated_at"),
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse(updatedPayload);
  } catch (error) {
    return handleApiError(error, "Failed to update booking");
  }
}
