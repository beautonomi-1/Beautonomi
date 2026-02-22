import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/conversations
 * 
 * Get provider's conversations with customers
 */
export async function GET(request: NextRequest) {
  try {
    // Check permission to view messages
    const permissionCheck = await requirePermission("view_messages", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    // If user doesn't have a provider_id, return empty array (they might be setting up)
    if (!providerId) {
      console.log(`No provider ID found for user ${user.id}, returning empty conversations list`);
      return successResponse([]);
    }

    // Get provider's user_id to filter out self-conversations
    const { data: providerData } = await supabase
      .from("providers")
      .select("user_id")
      .eq("id", providerId)
      .single();
    
    const providerUserId = providerData?.user_id;

    // First, get conversations - exclude conversations where provider is messaging themselves
    let query = supabase
      .from("conversations")
      .select(
        `
        id,
        booking_id,
        customer_id,
        provider_id,
        last_message_at,
        last_message_preview,
        unread_count_provider,
        is_archived_provider,
        created_at,
        booking:bookings!conversations_booking_id_fkey(id, booking_number)
      `
      )
      .eq("provider_id", providerId);
    
    // Filter out conversations where customer_id equals provider's user_id (provider messaging themselves)
    if (providerUserId) {
      query = query.neq("customer_id", providerUserId);
    }
    
    const { data: conversations, error } = await query
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (error) {
      throw error;
    }

    // Filter out conversations with no messages (no last_message_preview and check if messages exist)
    // Only show conversations that have at least one message
    const conversationIds = (conversations || []).map((c: any) => c.id);
    let conversationsWithMessages = conversations || [];

    if (conversationIds.length > 0) {
      // Check which conversations have messages
      const { data: messagesData } = await supabase
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", conversationIds)
        .limit(1000); // Reasonable limit

      if (messagesData && messagesData.length > 0) {
        const conversationIdsWithMessages = new Set(
          messagesData.map((m: any) => m.conversation_id)
        );
        
        // Filter to only include conversations that have messages OR have a last_message_preview
        conversationsWithMessages = (conversations || []).filter((conv: any) => {
          return conversationIdsWithMessages.has(conv.id) || 
                 (conv.last_message_preview && conv.last_message_preview.trim() !== "");
        });
      } else {
        // No messages found, only include conversations with last_message_preview
        conversationsWithMessages = (conversations || []).filter((conv: any) => {
          return conv.last_message_preview && conv.last_message_preview.trim() !== "";
        });
      }
    }

    if (error) {
      throw error;
    }

    // Fetch customer data separately using admin client to bypass RLS
    const customerIds = [...new Set(conversationsWithMessages.map((c: any) => c.customer_id).filter(Boolean))];
    let customerMap: Record<string, any> = {};
    
    if (customerIds.length > 0) {
      // Use admin client to bypass RLS policies on users table
      const supabaseAdmin = await getSupabaseAdmin();
      const { data: customers, error: customerError } = await supabaseAdmin
        .from("users")
        .select("id, full_name, email, avatar_url")
        .in("id", customerIds);
      
      if (customerError) {
        console.error("Error fetching customer data from users table:", customerError);
      }
      
      if (customers && customers.length > 0) {
        customerMap = customers.reduce((acc: Record<string, any>, customer: any) => {
          acc[customer.id] = customer;
          return acc;
        }, {});
        
        console.log(`✅ Fetched ${customers.length} customers for ${customerIds.length} conversations`);
        
        // Check if we're missing any customers (data integrity issue)
        const foundIds = new Set(customers.map((c: any) => c.id));
        const missingIds = customerIds.filter(id => !foundIds.has(id));
        if (missingIds.length > 0) {
          console.warn(`⚠️ Data integrity issue: ${missingIds.length} customer IDs in conversations but not in users table:`, missingIds);
        }
      } else if (customerIds.length > 0) {
        console.warn(`⚠️ No customers found in users table for ${customerIds.length} customer IDs`);
        console.warn(`Customer IDs:`, customerIds);
      }
    }

    const transformed = conversationsWithMessages.map((conv: any) => {
      // Try to get customer from join first, then from map
      const customer = conv.customer || customerMap[conv.customer_id];
      
      // Determine customer name - prioritize full_name, then email, then fallback
      let customerName = "Customer";
      if (customer) {
        if (customer.full_name && customer.full_name.trim()) {
          customerName = customer.full_name.trim();
        } else if (customer.email) {
          customerName = customer.email;
        }
      }
      // If customer not found, we'll use "Customer" as fallback
      // This is logged above in the missing customers check
      
      return {
        id: conv.id,
        customer_id: conv.customer_id,
        customer_name: customerName,
        customer_avatar: customer?.avatar_url || null,
        last_message: conv.last_message_preview || "",
        last_message_time: conv.last_message_at || conv.created_at,
        last_message_at: conv.last_message_at || conv.created_at, // Ensure last_message_at is set
        last_message_preview: conv.last_message_preview || "", // Ensure last_message_preview is set
        unread_count: conv.unread_count_provider || 0,
        status: conv.is_archived_provider ? "archived" : "active",
        booking_id: conv.booking_id || null,
        booking_number: conv.booking?.booking_number || null,
        // For provider portal, avatar should be customer avatar
        avatar: customer?.avatar_url || null,
        provider_id: conv.provider_id, // Include provider_id for consistency
      };
    });

    return successResponse(transformed);
  } catch (error) {
    return handleApiError(error, "Failed to fetch conversations");
  }
}
