import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";

/**
 * POST /api/me/delete-account
 * 
 * Permanently delete the current user's account and all associated data
 * This is different from deactivation - it permanently removes the account
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const { password, reason } = body;

    if (!password) {
      return NextResponse.json(
        { error: "Password is required to delete your account" },
        { status: 400 }
      );
    }

    // Verify password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: password,
    });

    if (signInError) {
      return NextResponse.json(
        { error: "Password is incorrect" },
        { status: 401 }
      );
    }

    // Mark account for deletion (for audit purposes)
    const { error: updateError } = await supabase
      .from('users')
      .update({
        account_deletion_requested_at: new Date().toISOString(),
        is_active: false,
        deactivation_reason: reason || 'Account deletion requested',
      })
      .eq('id', user.id);

    if (updateError) {
      throw updateError;
    }

    // Delete all user-related data
    // Note: Tables with ON DELETE CASCADE will be automatically cleaned up
    // But we'll explicitly delete from tables that might not have CASCADE

    // Delete conversations and messages
    const { data: conversations } = await supabase
      .from("conversations")
      .select("id")
      .or(`customer_id.eq.${user.id},provider_id.eq.${user.id}`);

    if (conversations && conversations.length > 0) {
      const conversationIds = conversations.map(c => c.id);
      await supabase
        .from("messages")
        .delete()
        .in("conversation_id", conversationIds);
      
      await supabase
        .from("conversations")
        .delete()
        .in("id", conversationIds);
    }

    // Delete custom requests
    await supabase
      .from("custom_requests")
      .delete()
      .eq("user_id", user.id);

    // Delete custom offers where user is involved
    await supabase
      .from("custom_offers")
      .delete()
      .or(`customer_id.eq.${user.id},provider_id.eq.${user.id}`);

    // Delete recently viewed items
    await supabase
      .from("recently_viewed")
      .delete()
      .eq("user_id", user.id);

    // Delete device tokens
    await supabase
      .from("user_devices")
      .delete()
      .eq("user_id", user.id);

    // Note: The following tables have ON DELETE CASCADE, so they'll be automatically deleted:
    // - user_profiles
    // - user_coupons
    // - user_verifications
    // - user_wallets
    // - addresses
    // - payment_methods
    // - wishlists
    // - provider_onboarding_drafts

    // For bookings, reviews, and providers - we may want to anonymize instead of delete
    // depending on business requirements. For now, we'll mark user as deleted but keep data
    // for business continuity (bookings history, reviews, etc.)

    // Anonymize user data in bookings (keep booking history but remove personal info)
    await supabase
      .from("bookings")
      .update({
        customer_id: null,
        customer_name: "Deleted User",
        customer_email: null,
        customer_phone: null,
      })
      .eq("customer_id", user.id);

    // Anonymize reviews
    await supabase
      .from("reviews")
      .update({
        reviewer_id: null,
        reviewer_name: "Deleted User",
      })
      .eq("reviewer_id", user.id);

    // Delete provider if user is a provider owner
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (provider) {
      // Delete provider staff first
      await supabase
        .from("provider_staff")
        .delete()
        .eq("provider_id", provider.id);

      // Delete provider services
      await supabase
        .from("provider_services")
        .delete()
        .eq("provider_id", provider.id);

      // Delete provider (this will cascade to related data)
      await supabase
        .from("providers")
        .delete()
        .eq("id", provider.id);
    }

    // Delete provider staff entries where user is staff
    await supabase
      .from("provider_staff")
      .delete()
      .eq("user_id", user.id);

    // Delete the user from auth.users using service role
    // Note: This requires SUPABASE_SERVICE_ROLE_KEY environment variable
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (serviceRoleKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        
        if (supabaseUrl) {
          const adminClient = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          });
          
          const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(user.id);
          
          if (deleteAuthError) {
            console.error("Failed to delete user from auth:", deleteAuthError);
            // Continue anyway - data is already cleaned up
          }
        }
      } catch (adminError) {
        console.error("Error creating admin client for user deletion:", adminError);
        // Continue anyway - data is already cleaned up
      }
    } else {
      // If service role key is not available, mark user as deleted
      // The actual auth user deletion can be handled by a background process
      console.warn("SUPABASE_SERVICE_ROLE_KEY not configured. User data cleaned but auth user remains.");
    }

    // Sign out the user after deletion
    await supabase.auth.signOut();

    return successResponse({
      message: "Your account deletion request has been submitted. Your account will be permanently deleted in accordance with our data retention policies.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to delete account");
  }
}
