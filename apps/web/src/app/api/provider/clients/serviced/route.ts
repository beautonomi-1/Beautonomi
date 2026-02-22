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
 * GET /api/provider/clients/serviced
 * Get all customers that have been serviced (from bookings)
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

    // Get all unique customers from active bookings (not cancelled/no_show)
    let bookingsQuery = supabase
      .from("bookings")
      .select("customer_id, scheduled_at, completed_at, total_amount, location_id, status")
      .eq("provider_id", providerId)
      .not("status", "in", '("cancelled","no_show")');
    
    // Filter by location if provided
    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }
    
    const { data: bookings, error: bookingsError } = await bookingsQuery;

    if (bookingsError) throw bookingsError;

    // Group by customer and calculate stats
    const customerStats: Record<
      string,
      {
        customer_id: string;
        last_service_date: string;
        total_bookings: number;
        total_spent: number;
      }
    > = {};

    bookings?.forEach((booking) => {
      const serviceDate = booking.completed_at || booking.scheduled_at;
      if (!serviceDate) return;

      if (!customerStats[booking.customer_id]) {
        customerStats[booking.customer_id] = {
          customer_id: booking.customer_id,
          last_service_date: serviceDate,
          total_bookings: 0,
          total_spent: 0,
        };
      }

      customerStats[booking.customer_id].total_bookings += 1;
      customerStats[booking.customer_id].total_spent += Number(booking.total_amount || 0);

      if (
        new Date(serviceDate) >
        new Date(customerStats[booking.customer_id].last_service_date)
      ) {
        customerStats[booking.customer_id].last_service_date = serviceDate;
      }
    });

    // Get customer details and check if they're saved
    const customerIds = Object.keys(customerStats);
    if (customerIds.length === 0) {
      return successResponse([]);
    }

    // Use admin client to bypass RLS when fetching customer data
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
        console.warn(`⚠️ ${missingIds.length} customer IDs in bookings but not found in users table:`, missingIds);
      }
    }

    // Get saved client IDs
    const { data: savedClients } = await supabase
      .from("provider_clients")
      .select("customer_id")
      .eq("provider_id", providerId)
      .in("customer_id", customerIds);

    const savedCustomerIds = new Set(savedClients?.map((c) => c.customer_id) || []);

    // Combine data - only include customers that were found in users table
    // For customers not found, we'll still include them with basic info from booking stats
    const foundCustomerIds = new Set(customers?.map((c: any) => c.id) || []);
    const missingCustomerIds = customerIds.filter(id => !foundCustomerIds.has(id));
    
    // Include found customers
    const servicedCustomers = customers?.map((customer) => ({
      customer_id: customer.id,
      customer,
      last_service_date: customerStats[customer.id].last_service_date,
      total_bookings: customerStats[customer.id].total_bookings,
      total_spent: customerStats[customer.id].total_spent,
      is_saved: savedCustomerIds.has(customer.id),
    })) || [];
    
    // Include missing customers with minimal info (they exist in bookings but not in users table)
    const missingCustomers = missingCustomerIds.map((customerId) => ({
      customer_id: customerId,
      customer: {
        id: customerId,
        full_name: null, // Will show as "Unknown"
        email: null,
        phone: null,
        avatar_url: null,
        rating_average: null,
        review_count: 0,
      },
      last_service_date: customerStats[customerId].last_service_date,
      total_bookings: customerStats[customerId].total_bookings,
      total_spent: customerStats[customerId].total_spent,
      is_saved: savedCustomerIds.has(customerId),
    }));
    
    const allServicedCustomers = [...servicedCustomers, ...missingCustomers];

    // Sort by last service date (most recent first)
    allServicedCustomers.sort(
      (a, b) =>
        new Date(b.last_service_date).getTime() - new Date(a.last_service_date).getTime()
    );

    // If search query is provided, filter by name, email, or phone
    let filteredCustomers = allServicedCustomers;
    if (searchQuery && searchQuery.trim().length > 0) {
      const searchLower = searchQuery.toLowerCase().trim();
      filteredCustomers = allServicedCustomers.filter((item) => {
        const customer = item.customer;
        if (!customer) return false;
        
        const nameMatch = customer.full_name?.toLowerCase().includes(searchLower);
        const emailMatch = customer.email?.toLowerCase().includes(searchLower);
        const phoneMatch = customer.phone?.toLowerCase().includes(searchLower);
        
        return nameMatch || emailMatch || phoneMatch;
      });
    }

    return successResponse(filteredCustomers);
  } catch (error) {
    return handleApiError(error, "Failed to load serviced customers");
  }
}
