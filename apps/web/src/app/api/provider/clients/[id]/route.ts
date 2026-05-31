import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  fetchDefaultAddressesForUsers,
  parseAddressFromBody,
  upsertCustomerDefaultAddress,
  CustomerHomeAddressLockedError,
} from "@/lib/provider-portal/user-default-address";
import {
  hasProviderCustomerActivityRelationship,
  hasProviderCustomerRelationship,
} from "@/lib/provider/client-access";
import {
  attachSalonMembership,
  buildSalonMembershipMap,
} from "@/lib/provider/attach-salon-membership-to-clients";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PATCH accepts `provider_clients.id` or `customer_id` (same as GET). If the
 * customer is known to this provider via bookings or conversations but has
 * no `provider_clients` row yet, we create one so notes/tags/address edits work
 * from mobile (serviced-only clients).
 */
async function resolveProviderClientRowForPatch(
  supabase: SupabaseClient,
  admin: ReturnType<typeof getSupabaseAdmin>,
  providerId: string,
  idOrCustomerId: string,
): Promise<{ id: string; customer_id: string } | null> {
  const { data: byRowId } = await supabase
    .from("provider_clients")
    .select("id, customer_id")
    .eq("id", idOrCustomerId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (byRowId) return byRowId;

  const { data: byCustomerId } = await supabase
    .from("provider_clients")
    .select("id, customer_id")
    .eq("customer_id", idOrCustomerId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (byCustomerId) return byCustomerId;

  const isKnownClient = await hasProviderCustomerRelationship(admin, providerId, idOrCustomerId);
  if (!isKnownClient) {
    return null;
  }

  const { data: inserted, error: insErr } = await admin
    .from("provider_clients")
    .insert({
      provider_id: providerId,
      customer_id: idOrCustomerId,
      notes: null,
      tags: null,
    })
    .select("id, customer_id")
    .single();

  if (inserted) return inserted;

  if (insErr?.code === "23505") {
    const { data: race } = await supabase
      .from("provider_clients")
      .select("id, customer_id")
      .eq("customer_id", idOrCustomerId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (race) return race;
  }

  console.error("resolveProviderClientRowForPatch: insert failed", insErr);
  return null;
}

/**
 * GET /api/provider/clients/[id]
 * Get a single client with history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("view_clients", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider account required", 403);
    }

    const { id: clientId } = await params;

    // Get client (could be provider_clients id or customer_id for unsaved clients)
    // First try as provider_clients id
    let client = null;
    let customerId: string | null = null;

    const { data: savedClient } = await supabase
      .from("provider_clients")
      .select("id, customer_id, notes, tags, is_favorite, last_service_date, total_bookings, total_spent, created_at, relationship_source, privacy_level, source_metadata, linked_existing_platform_user")
      .eq("id", clientId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (savedClient) {
      customerId = savedClient.customer_id;
      client = savedClient;
    } else {
      // Try as customer_id (for unsaved clients)
      customerId = clientId;
    }

    if (!customerId) {
      console.error("No customer_id found for client:", clientId);
      return notFoundResponse("Client not found");
    }

    console.log("Loading client history:", {
      clientId,
      customerId,
      providerId,
      isSavedClient: !!client,
    });

    const supabaseAdmin = await getSupabaseAdmin();
    const canViewClient = await hasProviderCustomerRelationship(supabaseAdmin, providerId, customerId);
    if (!canViewClient) {
      return notFoundResponse("Client not found");
    }
    const hasActivityRelationship = await hasProviderCustomerActivityRelationship(
      supabaseAdmin,
      providerId,
      customerId,
    );

    // Get customer details using admin client to bypass RLS only after the
    // provider-client relationship is proven.
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("users")
      .select(
        "id, full_name, email, phone, avatar_url, identity_verified, identity_verification_status, rating_average, review_count, customer_review_rating_avg, customer_review_rating_count, customer_booking_rating_avg, customer_booking_rating_count, created_at, date_of_birth, email_notifications_enabled, sms_notifications_enabled",
      )
      .eq("id", customerId)
      .single();

    if (customerError || !customer) {
      console.error("Error fetching customer data for client history:", customerError);
      // Return a response with minimal data if customer not found, but still try to get history
      const { data: appointments, error: appointmentsError } = await supabaseAdmin
        .from("bookings")
        .select(`
          id, 
          booking_number, 
          scheduled_at, 
          completed_at,
          status, 
          total_amount, 
          payment_status,
          subtotal,
          total_paid
        `)
        .eq("provider_id", providerId)
        .eq("customer_id", customerId)
        .order("scheduled_at", { ascending: false })
        .limit(100);
      
      if (appointmentsError) {
        console.error("Error fetching appointments (fallback):", appointmentsError);
      }
      
      // For fallback, we don't fetch detailed services/staff info, just return basic history
      return successResponse({
        id: client?.id || customerId,
        customer_id: customerId,
        customer: {
          id: customerId,
          full_name: null,
          email: null,
          phone: null,
          avatar_url: null,
          rating_average: null,
          review_count: 0,
          customer_review_rating_avg: null,
          customer_review_rating_count: null,
          customer_booking_rating_avg: null,
          customer_booking_rating_count: null,
          created_at: null,
        },
        notes: client?.notes || null,
        tags: client?.tags || [],
        is_favorite: client?.is_favorite || false,
        last_service_date: client?.last_service_date || null,
        total_bookings: client?.total_bookings || appointments?.length || 0,
        total_spent: client?.total_spent || 0,
        created_at: client?.created_at || null,
        history: appointments?.map((apt: any) => ({
          id: apt.id,
          type: "appointment",
          date: apt.scheduled_at || apt.completed_at,
          description: `Appointment ${apt.booking_number || apt.id}`,
          amount: apt.total_amount || 0,
          team_member_name: null, // Staff info not available in fallback
          status: apt.status,
          booking_number: apt.booking_number,
          payment_status: apt.payment_status,
          subtotal: apt.subtotal || 0,
          total_paid: apt.total_paid || 0,
        })) || [],
      });
    }

    // Get client history (appointments, sales, notes)
    const history: any[] = [];

    // Get appointments with detailed information using admin client to bypass RLS
    // Include ALL bookings regardless of status for history view
    const { data: appointments, error: appointmentsError } = await supabaseAdmin
      .from("bookings")
      .select(`
        id, 
        booking_number, 
        scheduled_at, 
        completed_at,
        status, 
        payment_status,
        subtotal,
        discount_amount,
        discount_code,
        tax_rate,
        tax_amount,
        platform_fee_percentage,
        platform_fee_amount,
        platform_fee_paid_by,
        service_fee_percentage,
        service_fee_amount,
        service_fee_paid_by,
        travel_fee,
        tip_amount,
        total_amount,
        total_paid,
        total_refunded,
        location_type,
        notes,
        booking_source,
        is_group_booking,
        group_booking_id,
        special_requests
      `)
      .eq("provider_id", providerId)
      .eq("customer_id", customerId)
      .order("scheduled_at", { ascending: false })
      .limit(100);

    if (appointmentsError) {
      console.error("Error fetching appointments for client history:", {
        error: appointmentsError,
        providerId,
        customerId,
        clientId,
      });
    }

    console.log("Found appointments for client history:", {
      count: appointments?.length || 0,
      providerId,
      customerId,
      clientId,
      appointments: appointments?.map((apt: any) => ({
        id: apt.id,
        booking_number: apt.booking_number,
        status: apt.status,
        payment_status: apt.payment_status,
        total_amount: apt.total_amount,
        total_paid: apt.total_paid,
        subtotal: apt.subtotal,
        service_fee_amount: apt.service_fee_amount,
        tax_amount: apt.tax_amount,
        tip_amount: apt.tip_amount,
        travel_fee: apt.travel_fee,
      })),
    });

    // Fetch booking services, addons, and products for each appointment
    if (appointments && appointments.length > 0) {
      const bookingIds = appointments.map((apt: any) => apt.id);
      
      // Get booking services (staff_id is in booking_services, not bookings)
      const { data: bookingServices } = await supabaseAdmin
        .from("booking_services")
        .select(`
          booking_id,
          offering_id,
          staff_id,
          duration_minutes,
          price,
          guest_name,
          offering:offerings (
            id,
            title
          )
        `)
        .in("booking_id", bookingIds);
      
      // Get staff information from booking_services
      const staffIds = [...new Set(bookingServices?.map((bs: any) => bs.staff_id).filter(Boolean) || [])];
      const staffMap = new Map();
      if (staffIds.length > 0) {
        const { data: staffMembers } = await supabaseAdmin
          .from("provider_staff")
          .select("id, name")
          .in("id", staffIds);
        staffMembers?.forEach((staff: any) => {
          staffMap.set(staff.id, staff);
        });
      }

      // Get booking addons (plain columns only — no FK join available;
      // addon_id references offerings.id but FK was dropped in migration 081)
      const { data: bookingAddons } = await supabaseAdmin
        .from("booking_addons")
        .select("booking_id, addon_id, quantity, price")
        .in("booking_id", bookingIds);

      // Get booking products
      const { data: bookingProducts } = await supabaseAdmin
        .from("booking_products")
        .select(`
          booking_id,
          product_id,
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey(
            id,
            name
          )
        `)
        .in("booking_id", bookingIds);

      // Group related data by booking_id
      const servicesByBooking = new Map();
      const addonsByBooking = new Map();
      const productsByBooking = new Map();

      bookingServices?.forEach((bs: any) => {
        if (!servicesByBooking.has(bs.booking_id)) {
          servicesByBooking.set(bs.booking_id, []);
        }
        servicesByBooking.get(bs.booking_id).push(bs);
      });

      bookingAddons?.forEach((ba: any) => {
        if (!addonsByBooking.has(ba.booking_id)) {
          addonsByBooking.set(ba.booking_id, []);
        }
        addonsByBooking.get(ba.booking_id).push(ba);
      });

      bookingProducts?.forEach((bp: any) => {
        if (!productsByBooking.has(bp.booking_id)) {
          productsByBooking.set(bp.booking_id, []);
        }
        productsByBooking.get(bp.booking_id).push(bp);
      });

      // Build history with detailed information
      appointments.forEach((apt: any) => {
        // Get staff name from booking_services (staff_id is in booking_services, not bookings)
        const bookingServicesForApt = servicesByBooking.get(apt.id) || [];
        let teamMember = null;
        for (const bs of bookingServicesForApt) {
          if (bs.staff_id && staffMap.has(bs.staff_id)) {
            teamMember = staffMap.get(bs.staff_id);
            break;
          }
        }

        // Skip participant rows that belong to a group — the group itself
        // appears as its own history entry below (avoids duplicates).
        if (apt.group_booking_id && !apt.is_group_booking) return;

        const isCustomOffer =
          apt.booking_source === "online" &&
          typeof apt.special_requests === "string" &&
          apt.special_requests.startsWith("Custom order:");

        history.push({
          id: apt.id,
          type: apt.is_group_booking ? "group" : isCustomOffer ? "custom_offer" : "appointment",
          date: apt.scheduled_at || apt.completed_at,
          description: apt.is_group_booking
            ? `Group booking ${apt.booking_number || apt.id}`
            : isCustomOffer
              ? `Custom offer ${apt.booking_number || apt.id}`
              : `Appointment ${apt.booking_number || apt.id}`,
          amount: apt.total_amount || 0,
          team_member_name: teamMember?.name || null,
          status: apt.status,
          booking_number: apt.booking_number,
          scheduled_at: apt.scheduled_at,
          completed_at: apt.completed_at,
          payment_status: apt.payment_status,
          subtotal: apt.subtotal || 0,
          discount_amount: apt.discount_amount || 0,
          discount_code: apt.discount_code,
          tax_rate: apt.tax_rate,
          tax_amount: apt.tax_amount || 0,
          platform_fee_percentage: Number(apt.platform_fee_percentage ?? apt.service_fee_percentage ?? 0),
          platform_fee_amount: Number(apt.platform_fee_amount ?? apt.service_fee_amount ?? 0),
          platform_fee_paid_by: apt.platform_fee_paid_by ?? apt.service_fee_paid_by ?? null,
          service_fee_percentage: Number(apt.service_fee_percentage ?? apt.platform_fee_percentage ?? 0),
          service_fee_amount: Number(apt.service_fee_amount ?? apt.platform_fee_amount ?? 0),
          service_fee_paid_by: apt.service_fee_paid_by ?? apt.platform_fee_paid_by ?? null,
          travel_fee: apt.travel_fee || 0,
          tip_amount: apt.tip_amount || 0,
          total_paid: apt.total_paid || 0,
          total_refunded: apt.total_refunded || 0,
          location_type: apt.location_type,
          notes: apt.notes,
          booking_source: apt.booking_source || null,
          is_group_booking: apt.is_group_booking || false,
          group_booking_id: apt.group_booking_id || null,
          services: servicesByBooking.get(apt.id) || [],
          addons: addonsByBooking.get(apt.id) || [],
          products: productsByBooking.get(apt.id) || [],
        });
      });
    }

    // Get product orders (standalone product purchases not tied to a booking)
    try {
      const { data: productOrders } = await supabaseAdmin
        .from("product_orders")
        .select(`
          id,
          order_number,
          created_at,
          status,
          total_amount,
          total_paid,
          payment_status
        `)
        .eq("provider_id", providerId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (productOrders) {
        productOrders.forEach((order: any) => {
          history.push({
            id: order.id,
            type: "product_order",
            date: order.created_at,
            description: `Product order ${order.order_number || order.id}`,
            amount: order.total_amount || 0,
            total_paid: order.total_paid || 0,
            payment_status: order.payment_status,
            status: order.status,
            team_member_name: null,
          });
        });
      }
    } catch {
      // product_orders table might not exist
    }

    // Get sales (walk-in POS sales)
    try {
      const { data: sales } = await supabaseAdmin
        .from("sales")
        .select(`
          id, 
          sale_number, 
          created_at, 
          total_amount, 
          staff_id,
          provider_staff:provider_staff!sales_staff_id_fkey(id, name)
        `)
        .eq("provider_id", providerId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (sales) {
        sales.forEach((sale: any) => {
          history.push({
            id: sale.id,
            type: "sale",
            date: sale.created_at,
            description: `Walk-in sale ${sale.sale_number || sale.id}`,
            amount: sale.total_amount || 0,
            team_member_name: sale.provider_staff?.name || null,
          });
        });
      }
    } catch {
      // Sales table might not exist, ignore
    }

    // Sort history by date descending
    history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Compute total_spent from actual paid bookings when provider_clients row is
    // absent or the trigger hasn't fired yet (e.g. walk-in clients).
    const computedTotalSpent =
      appointments?.reduce(
        (sum: number, apt: any) =>
          apt.payment_status === "paid" || apt.payment_status === "partially_paid"
            ? sum + (apt.total_paid || apt.total_amount || 0)
            : sum,
        0,
      ) ?? 0;

    const defaultAddrMap = await fetchDefaultAddressesForUsers(supabaseAdmin, [customerId]);
    // §Release-audit 2026-04 — expose `is_registered` so the provider UI
    // can disable identity-editing controls for self-registered customers
    // (same semantics as the list endpoint + the server-side lock in PATCH).
    const customerEmail = (customer as { email?: string | null }).email ?? "";
    const isRegistered =
      typeof customerEmail === "string" &&
      customerEmail.length > 0 &&
      !customerEmail.includes("beautonomi.invalid") &&
      !customerEmail.includes("beautonomi.local");
    const customerWithAddress = {
      ...customer,
      is_registered: isRegistered,
      default_address: defaultAddrMap.get(customerId) ?? null,
    };
    const limitedPlatformLink =
      client?.relationship_source === "manual_existing_platform" &&
      client?.privacy_level === "limited" &&
      !hasActivityRelationship;
    const metadata =
      client?.source_metadata && typeof client.source_metadata === "object"
        ? (client.source_metadata as Record<string, unknown>)
        : {};

    const membershipMap = await buildSalonMembershipMap(providerId, [customerId], supabaseAdmin);
    const salonMembership =
      attachSalonMembership([{ customer_id: customerId }], (r) => r.customer_id, membershipMap)[0]
        ?.salon_membership ?? null;

    return successResponse({
      id: client?.id || customerId,
      customer_id: customerId,
      customer: limitedPlatformLink
        ? {
            id: customerWithAddress.id,
            full_name: metadata.provider_supplied_name || customerWithAddress.full_name || "Existing Beautonomi customer",
            email: metadata.matched_on === "email" ? customerWithAddress.email : metadata.provider_supplied_email ?? null,
            phone: metadata.matched_on === "phone" ? customerWithAddress.phone : metadata.provider_supplied_phone ?? null,
            avatar_url: null,
            created_at: customerWithAddress.created_at,
            rating_average: null,
            review_count: 0,
            customer_review_rating_avg: null,
            customer_review_rating_count: null,
            customer_booking_rating_avg: null,
            customer_booking_rating_count: null,
            is_registered: true,
            is_limited_platform_link: true,
            default_address: null,
          }
        : customerWithAddress,
      notes: client?.notes || null,
      tags: client?.tags || [],
      is_favorite: client?.is_favorite || false,
      last_service_date: client?.last_service_date || null,
      total_bookings: client?.total_bookings || appointments?.length || 0,
      total_spent: client?.total_spent || computedTotalSpent,
      created_at: client?.created_at || customer.created_at,
      salon_membership: salonMembership,
      history,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load client");
  }
}

/**
 * PATCH /api/provider/clients/[id]
 * Update a saved client
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("edit_clients", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider account required", 403);
    }

    const { id: clientId } = await params;
    const body = await request.json();

    const admin = getSupabaseAdmin();
    const client = await resolveProviderClientRowForPatch(supabase, admin, providerId, clientId);

    if (!client) {
      return notFoundResponse("Client not found");
    }

    const resolvedRowId = client.id;

    // Update provider_clients fields
    const updateData: any = {};
    if (body.notes !== undefined) updateData.notes = body.notes || null;
    if (body.tags !== undefined) updateData.tags = body.tags && body.tags.length > 0 ? body.tags : null;
    if (body.is_favorite !== undefined) updateData.is_favorite = body.is_favorite;

    let data: any = null;
    if (Object.keys(updateData).length > 0) {
      const { data: updated, error } = await supabase
        .from("provider_clients")
        .update(updateData)
        .eq("id", resolvedRowId)
        .select()
        .single();

      if (error) throw error;
      data = updated;
    } else {
      const { data: existing } = await supabase
        .from("provider_clients")
        .select()
        .eq("id", resolvedRowId)
        .single();
      data = existing;
    }

    // Update user-level fields on the users table if provided.
    // §Release-audit 2026-04 — customer vs provider parity:
    // Only allow writing identity / contact columns on the `users` row
    // when this is a provider-created walk-in placeholder (those accounts
    // are flagged by an `@beautonomi.invalid` / `@beautonomi.local` email).
    // For a self-registered Beautonomi customer the `users` row is their
    // own profile surface (see GET /api/me/profile) and providers must
    // not be able to rewrite name/phone/email/DOB/notification prefs from
    // the provider portal. The notes/tags/is_favorite fields above live
    // on `provider_clients` and are correctly provider-owned.
    const identityBodyKeys = [
      "date_of_birth",
      "full_name",
      "phone",
      "email",
      "sms_opt_in",
      "email_opt_in",
    ] as const;
    const identityFieldsInBody = identityBodyKeys.filter(
      (k) => (body as Record<string, unknown>)[k] !== undefined,
    );

    let profileLockedForIdentity = false;
    if (identityFieldsInBody.length > 0 && client.customer_id) {
      const { data: targetUser } = await admin
        .from("users")
        .select("email")
        .eq("id", client.customer_id)
        .maybeSingle();

      const targetEmail = (targetUser as { email?: string | null } | null)?.email ?? "";
      const isWalkInPlaceholder =
        targetEmail.includes("beautonomi.invalid") ||
        targetEmail.includes("beautonomi.local");

      if (!isWalkInPlaceholder) {
        profileLockedForIdentity = true;
        // Silently ignore identity writes for registered customers so a
        // provider saving `notes` + auto-echoed `date_of_birth` doesn't
        // 403. The mobile `Edit` button is hidden for registered clients
        // (see apps/provider/app/(app)/(tabs)/clients/[id].tsx),
        // and provider-web should hide identity inputs the same way.
        console.info(
          "[provider/clients PATCH] dropping identity-field writes for registered customer",
          { customerId: client.customer_id, attemptedFields: identityFieldsInBody },
        );
      } else {
        const userUpdates: Record<string, unknown> = {};
        if (body.date_of_birth !== undefined) userUpdates.date_of_birth = body.date_of_birth || null;
        if (body.full_name !== undefined) userUpdates.full_name = body.full_name;
        if (body.phone !== undefined) userUpdates.phone = body.phone;
        if (body.email !== undefined) userUpdates.email = body.email;
        if (body.sms_opt_in !== undefined) userUpdates.sms_notifications_enabled = body.sms_opt_in;
        if (body.email_opt_in !== undefined) userUpdates.email_notifications_enabled = body.email_opt_in;

        if (Object.keys(userUpdates).length > 0) {
          await admin
            .from("users")
            .update(userUpdates)
            .eq("id", client.customer_id);
        }
      }
    }
    // Suppress unused-var warning if the caller doesn't inspect this —
    // the variable exists for future response surface (e.g. returning a
    // flag so the UI can show "identity fields were ignored").
    void profileLockedForIdentity;

    const addressPayload = parseAddressFromBody(body);
    if (addressPayload && client.customer_id) {
      try {
        await upsertCustomerDefaultAddress(admin, client.customer_id, addressPayload);
      } catch (e) {
        if (e instanceof CustomerHomeAddressLockedError) {
          return errorResponse(e.message, e.code, 403);
        }
        console.error("PATCH /provider/clients/[id]: address upsert failed", e);
        return handleApiError(
          e instanceof Error ? e : new Error("Failed to save address"),
          "Failed to save client address",
          400,
        );
      }
    }

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update client");
  }
}

/**
 * DELETE /api/provider/clients/[id]
 * Remove a saved client
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("edit_clients", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider account required", 403);
    }

    const { id: clientId } = await params;

    // Verify client belongs to provider
    const { data: client } = await supabase
      .from("provider_clients")
      .select("id")
      .eq("id", clientId)
      .eq("provider_id", providerId)
      .single();

    if (!client) {
      return notFoundResponse("Client not found");
    }

    const { error } = await supabase.from("provider_clients").delete().eq("id", clientId);

    if (error) throw error;

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete client");
  }
}
