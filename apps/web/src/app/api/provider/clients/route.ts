import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/clients
 * Get all saved clients for the provider
 */
export async function GET(request: NextRequest) {
  try {
    // Check permission to view clients (pass request for Bearer token from mobile)
    const permissionCheck = await requirePermission("view_clients", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("location_id");
    const searchQuery = searchParams.get("search");
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider account required", 403);
    }

    const clientsQuery = supabase
      .from("provider_clients")
      .select("id, notes, tags, is_favorite, last_service_date, total_bookings, total_spent, created_at, customer_id")
      .eq("provider_id", providerId);

    // If location_id is provided (and no search), also fetch customer IDs with bookings at that location
    // We still show ALL saved clients but can mark which ones have location-specific bookings
    let _locationCustomerIds: Set<string> | null = null;
    if (locationId && !searchQuery) {
      const { data: locationBookings } = await supabase
        .from("bookings")
        .select("customer_id")
        .eq("provider_id", providerId)
        .or(`location_id.eq.${locationId},location_id.is.null`);
      
      _locationCustomerIds = new Set((locationBookings || []).map((b: any) => b.customer_id));
    }

    const { data: clients, error } = await clientsQuery
      .order("is_favorite", { ascending: false })
      .order("last_service_date", { ascending: false, nullsFirst: false });

    if (error) {
      throw error;
    }

    if (!clients || clients.length === 0) {
      return successResponse([]);
    }

    // Fetch customer details using admin client to bypass RLS
    const customerIds = clients.map((c) => c.customer_id);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: customers, error: customersError } = await supabaseAdmin
      .from("users")
      .select("id, full_name, email, phone, avatar_url, rating_average, review_count, date_of_birth, email_notifications_enabled, sms_notifications_enabled")
      .in("id", customerIds);

    if (customersError) {
      console.error("Error fetching customer data from users table (admin client):", customersError);
      throw customersError;
    }
    
    // Log missing customers for debugging
    if (customers && customers.length < customerIds.length) {
      const foundIds = new Set(customers.map((c: any) => c.id));
      const missingIds = customerIds.filter(id => !foundIds.has(id));
      if (missingIds.length > 0) {
        console.warn(`⚠️ ${missingIds.length} customer IDs in provider_clients but not found in users table:`, missingIds);
      }
    }

    // Combine data - include all clients even if customer data is missing
    const _foundCustomerIds = new Set(customers?.map((c: any) => c.id) || []);
    let clientsWithCustomers = clients.map((client) => {
      const customer = customers?.find((c) => c.id === client.customer_id);
      
      // If customer not found, create minimal customer object
      if (!customer) {
        return {
          ...client,
          customer: {
            id: client.customer_id,
            full_name: null,
            email: null,
            phone: null,
            avatar_url: null,
            rating_average: null,
            review_count: 0,
          },
        };
      }
      
      return {
        ...client,
        customer,
      };
    });

    // If search query is provided, filter by name, email, or phone
    if (searchQuery && searchQuery.trim().length > 0) {
      const searchLower = searchQuery.toLowerCase().trim();
      clientsWithCustomers = clientsWithCustomers.filter((client) => {
        const customer = client.customer;
        if (!customer) return false;
        
        const nameMatch = customer.full_name?.toLowerCase().includes(searchLower);
        const emailMatch = customer.email?.toLowerCase().includes(searchLower);
        const phoneMatch = customer.phone?.toLowerCase().includes(searchLower);
        
        return nameMatch || emailMatch || phoneMatch;
      });
    }

    return successResponse(clientsWithCustomers);
  } catch (error) {
    return handleApiError(error, "Failed to load clients");
  }
}

/**
 * POST /api/provider/clients
 * Save a new client
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { customer_id, notes, tags, is_favorite } = body;

    if (!customer_id) {
      return handleApiError(new Error("customer_id is required"), "Validation error", 400);
    }

    // Check if client already exists
    const { data: existing } = await supabase
      .from("provider_clients")
      .select("id")
      .eq("provider_id", providerId)
      .eq("customer_id", customer_id)
      .single();

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from("provider_clients")
        .update({
          notes: notes || null,
          tags: tags && tags.length > 0 ? tags : null,
          is_favorite: is_favorite || false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      return successResponse(data);
    }

    // Create new
    const { data, error } = await supabase
      .from("provider_clients")
      .insert({
        provider_id: providerId,
        customer_id,
        notes: notes || null,
        tags: tags && tags.length > 0 ? tags : null,
        is_favorite: is_favorite || false,
      })
      .select()
      .single();

    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to save client");
  }
}
