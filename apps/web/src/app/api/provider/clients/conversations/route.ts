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
 * GET /api/provider/clients/conversations
 * Get all customers that have had conversations with the provider
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
    const supabaseAdmin = await getSupabaseAdmin(); // Use admin client to bypass RLS
    const { searchParams } = new URL(request.url);
    const _locationId = searchParams.get("location_id");
    const searchQuery = searchParams.get("search");
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider account required", 403);
    }

    // Get provider's user_id to exclude self-conversations
    const { data: providerData } = await supabase
      .from("providers")
      .select("user_id")
      .eq("id", providerId)
      .single();
    
    const providerUserId = providerData?.user_id;

    // Get all unique customers from conversations
    // First, get conversations with messages (either have last_message_preview or have messages)
    let conversationsQuery = supabase
      .from("conversations")
      .select("customer_id, last_message_at, last_message_preview, created_at")
      .eq("provider_id", providerId)
      .not("last_message_preview", "is", null); // Only get conversations with a message preview
    
    // Exclude conversations where provider is messaging themselves
    if (providerUserId) {
      conversationsQuery = conversationsQuery.neq("customer_id", providerUserId);
    }
    
    const { data: conversations, error: conversationsError } = await conversationsQuery;

    if (conversationsError) {
      throw conversationsError;
    }

    if (!conversations || conversations.length === 0) {
      return successResponse([]);
    }

    // Get unique customer IDs
    const customerIds = [...new Set(conversations.map((c: any) => c.customer_id).filter(Boolean))];
    
    if (customerIds.length === 0) {
      return successResponse([]);
    }

    // Get customer details using admin client to bypass RLS
    const { data: customers, error: customersError } = await supabaseAdmin
      .from("users")
      .select("id, full_name, email, phone, avatar_url, rating_average, review_count, date_of_birth, email_notifications_enabled, sms_notifications_enabled")
      .in("id", customerIds);

    if (customersError) {
      console.error("Error fetching customer data from conversations:", customersError);
      throw customersError;
    }

    // Group conversations by customer and get the most recent message date
    const customerConversations: Record<
      string,
      {
        customer_id: string;
        last_message_date: string;
        conversation_count: number;
      }
    > = {};

    conversations.forEach((conv: any) => {
      if (!conv.customer_id) return;

      if (!customerConversations[conv.customer_id]) {
        customerConversations[conv.customer_id] = {
          customer_id: conv.customer_id,
          last_message_date: conv.last_message_at || conv.created_at,
          conversation_count: 0,
        };
      }

      customerConversations[conv.customer_id].conversation_count += 1;

      // Update last message date if this is more recent
      const convDate = conv.last_message_at || conv.created_at;
      if (new Date(convDate) > new Date(customerConversations[conv.customer_id].last_message_date)) {
        customerConversations[conv.customer_id].last_message_date = convDate;
      }
    });

    // Get saved client IDs to mark which ones are already saved
    const { data: savedClients } = await supabase
      .from("provider_clients")
      .select("customer_id")
      .eq("provider_id", providerId)
      .in("customer_id", customerIds);

    const savedCustomerIds = new Set(savedClients?.map((c) => c.customer_id) || []);

    // Get booking stats for these customers (to show if they've booked)
    const { data: bookings } = await supabase
      .from("bookings")
      .select("customer_id, completed_at, total_amount")
      .eq("provider_id", providerId)
      .in("customer_id", customerIds)
      .eq("status", "completed");

    // Calculate booking stats per customer
    const bookingStats: Record<string, { total_bookings: number; total_spent: number; last_service_date?: string }> = {};
    bookings?.forEach((booking) => {
      if (!bookingStats[booking.customer_id]) {
        bookingStats[booking.customer_id] = {
          total_bookings: 0,
          total_spent: 0,
        };
      }
      bookingStats[booking.customer_id].total_bookings += 1;
      bookingStats[booking.customer_id].total_spent += Number(booking.total_amount || 0);
      if (booking.completed_at) {
        const completedDate = booking.completed_at;
        if (!bookingStats[booking.customer_id].last_service_date || 
            new Date(completedDate) > new Date(bookingStats[booking.customer_id].last_service_date)) {
          bookingStats[booking.customer_id].last_service_date = completedDate;
        }
      }
    });

    // Combine data
    const conversationCustomers = customers?.map((customer) => {
      const convData = customerConversations[customer.id];
      const bookingData = bookingStats[customer.id];
      
      return {
        customer_id: customer.id,
        customer,
        last_message_date: convData?.last_message_date || null,
        conversation_count: convData?.conversation_count || 0,
        last_service_date: bookingData?.last_service_date || null,
        total_bookings: bookingData?.total_bookings || 0,
        total_spent: bookingData?.total_spent || 0,
        is_saved: savedCustomerIds.has(customer.id),
        has_booked: !!bookingData,
      };
    }) || [];

    // Sort by last message date (most recent first)
    conversationCustomers.sort((a, b) => {
      const dateA = a.last_message_date ? new Date(a.last_message_date).getTime() : 0;
      const dateB = b.last_message_date ? new Date(b.last_message_date).getTime() : 0;
      return dateB - dateA;
    });

    // If search query is provided, filter by name, email, or phone
    let filteredCustomers = conversationCustomers;
    if (searchQuery && searchQuery.trim().length > 0) {
      const searchLower = searchQuery.toLowerCase().trim();
      filteredCustomers = conversationCustomers.filter((item) => {
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
    return handleApiError(error, "Failed to load conversation customers");
  }
}
