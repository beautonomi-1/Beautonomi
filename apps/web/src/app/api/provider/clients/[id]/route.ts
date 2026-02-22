import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/clients/[id]
 * Get a single client with history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to view clients (pass request for Bearer token from mobile)
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
      .select("id, customer_id, notes, tags, is_favorite, last_service_date, total_bookings, total_spent, created_at")
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

    // Get customer details using admin client to bypass RLS
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("users")
      .select("id, full_name, email, phone, avatar_url, rating_average, review_count, created_at, date_of_birth, email_notifications_enabled, sms_notifications_enabled")
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
        service_fee_percentage,
        service_fee_amount,
        travel_fee,
        tip_amount,
        total_amount,
        total_paid,
        total_refunded,
        location_type,
        notes
      `)
      .eq("provider_id", providerId)
      .eq("customer_id", customerId)
      .order("scheduled_at", { ascending: false })
      .limit(100); // Increased limit to show more history

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
          quantity,
          unit_price,
          total_price,
          duration_minutes,
          customization,
          offerings:offerings!booking_services_offering_id_fkey(
            id,
            name,
            service_category_id,
            global_service_categories:global_service_categories!offerings_service_category_id_fkey(name)
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

      // Get booking addons
      const { data: bookingAddons } = await supabaseAdmin
        .from("booking_addons")
        .select(`
          booking_id,
          addon_id,
          quantity,
          unit_price,
          total_price,
          service_addons:service_addons!booking_addons_addon_id_fkey(
            id,
            name
          )
        `)
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
        // Try to get staff from the first service that has a staff_id
        let teamMember = null;
        for (const bs of bookingServicesForApt) {
          if (bs.staff_id && staffMap.has(bs.staff_id)) {
            teamMember = staffMap.get(bs.staff_id);
            break;
          }
        }
        
        history.push({
          id: apt.id,
          type: "appointment",
          date: apt.scheduled_at || apt.completed_at,
          description: `Appointment ${apt.booking_number || apt.id}`,
          amount: apt.total_amount || 0,
          team_member_name: teamMember?.name || null,
          status: apt.status,
          // Detailed booking information
          booking_number: apt.booking_number,
          scheduled_at: apt.scheduled_at,
          completed_at: apt.completed_at,
          payment_status: apt.payment_status,
          subtotal: apt.subtotal || 0,
          discount_amount: apt.discount_amount || 0,
          discount_code: apt.discount_code,
          tax_rate: apt.tax_rate,
          tax_amount: apt.tax_amount || 0,
          service_fee_percentage: apt.service_fee_percentage,
          service_fee_amount: apt.service_fee_amount || 0,
          travel_fee: apt.travel_fee || 0,
          tip_amount: apt.tip_amount || 0,
          total_paid: apt.total_paid || 0,
          total_refunded: apt.total_refunded || 0,
          location_type: apt.location_type,
          notes: apt.notes,
          services: servicesByBooking.get(apt.id) || [],
          addons: addonsByBooking.get(apt.id) || [],
          products: productsByBooking.get(apt.id) || [],
        });
      });
    }

    // Get sales (if sales table exists) using admin client
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
            description: `Sale ${sale.sale_number || sale.id}`,
            amount: sale.total_amount || 0,
            team_member_name: sale.provider_staff?.name || null,
          });
        });
      }
    } catch (error) {
      // Sales table might not exist, ignore
      console.warn("Sales table not available:", error);
    }

    // Sort history by date
    history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return successResponse({
      id: client?.id || customerId,
      customer_id: customerId,
      customer,
      notes: client?.notes || null,
      tags: client?.tags || [],
      is_favorite: client?.is_favorite || false,
      last_service_date: client?.last_service_date || null,
      total_bookings: client?.total_bookings || appointments?.length || 0,
      total_spent: client?.total_spent || 0,
      created_at: client?.created_at || customer.created_at,
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
    // Check permission to edit clients (pass request for Bearer token from mobile)
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

    // Verify client belongs to provider
    const { data: client, error: clientError } = await supabase
      .from("provider_clients")
      .select("id, provider_id, customer_id")
      .eq("id", clientId)
      .eq("provider_id", providerId)
      .single();

    if (clientError || !client) {
      return notFoundResponse("Client not found");
    }

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
        .eq("id", clientId)
        .select()
        .single();

      if (error) throw error;
      data = updated;
    } else {
      const { data: existing } = await supabase
        .from("provider_clients")
        .select()
        .eq("id", clientId)
        .single();
      data = existing;
    }

    // Update user-level fields on the users table if provided
    if (client.customer_id) {
      const userUpdates: any = {};
      if (body.date_of_birth !== undefined) userUpdates.date_of_birth = body.date_of_birth || null;
      if (body.full_name !== undefined) userUpdates.full_name = body.full_name;
      if (body.phone !== undefined) userUpdates.phone = body.phone;
      if (body.email !== undefined) userUpdates.email = body.email;
      if (body.sms_opt_in !== undefined) userUpdates.sms_notifications_enabled = body.sms_opt_in;
      if (body.email_opt_in !== undefined) userUpdates.email_notifications_enabled = body.email_opt_in;

      if (Object.keys(userUpdates).length > 0) {
        const supabaseAdmin = await getSupabaseAdmin();
        await supabaseAdmin
          .from("users")
          .update(userUpdates)
          .eq("id", client.customer_id);
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
    // Check permission to edit clients (pass request for Bearer token from mobile)
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
