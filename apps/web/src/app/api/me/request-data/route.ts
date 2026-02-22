import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";

/**
 * POST /api/me/request-data
 * 
 * Request a personal data export for the current user
 * This will create a data export request that can be processed asynchronously
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();

    // Check if there's already a pending request
    const { data: existingUser } = await supabase
      .from("users")
      .select("data_export_requested_at, data_export_ready_at")
      .eq("id", user.id)
      .single();

    if (existingUser?.data_export_requested_at && !existingUser?.data_export_ready_at) {
      return NextResponse.json(
        { error: "You already have a pending data export request. Please wait for it to be processed." },
        { status: 400 }
      );
    }

    // Update user with data export request timestamp
    const { error: updateError } = await supabase
      .from("users")
      .update({
        data_export_requested_at: new Date().toISOString(),
        data_export_ready_at: null,
        data_export_download_url: null,
      })
      .eq("id", user.id);

    if (updateError) {
      throw updateError;
    }

    // Generate data export immediately
    try {
      const exportData: Record<string, any> = {
        exportDate: new Date().toISOString(),
        userId: user.id,
        userEmail: user.email,
      };

      // Collect user profile data
      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();
      exportData.profile = userData;

      // Collect user profile extended data
      const { data: userProfile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      exportData.extendedProfile = userProfile;

      // Collect bookings
      const { data: bookings } = await supabase
        .from("bookings")
        .select("*")
        .or(`customer_id.eq.${user.id},provider_id.eq.${user.id}`);
      exportData.bookings = bookings || [];

      // Collect messages and conversations
      const { data: conversations } = await supabase
        .from("conversations")
        .select("*")
        .or(`customer_id.eq.${user.id},provider_id.eq.${user.id}`);
      exportData.conversations = conversations || [];

      if (conversations && conversations.length > 0) {
        const conversationIds = conversations.map(c => c.id);
        const { data: messages } = await supabase
          .from("messages")
          .select("*")
          .in("conversation_id", conversationIds);
        exportData.messages = messages || [];
      } else {
        exportData.messages = [];
      }

      // Collect reviews
      const { data: reviews } = await supabase
        .from("reviews")
        .select("*")
        .or(`reviewer_id.eq.${user.id},reviewee_id.eq.${user.id}`);
      exportData.reviews = reviews || [];

      // Collect addresses
      const { data: addresses } = await supabase
        .from("addresses")
        .select("*")
        .eq("user_id", user.id);
      exportData.addresses = addresses || [];

      // Collect payment methods
      const { data: paymentMethods } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("user_id", user.id);
      exportData.paymentMethods = paymentMethods || [];

      // Collect wishlists
      const { data: wishlists } = await supabase
        .from("wishlists")
        .select("*")
        .eq("user_id", user.id);
      exportData.wishlists = wishlists || [];

      // Collect user coupons
      const { data: userCoupons } = await supabase
        .from("user_coupons")
        .select("*")
        .eq("user_id", user.id);
      exportData.coupons = userCoupons || [];

      // Collect wallet data
      const { data: wallet } = await supabase
        .from("user_wallets")
        .select("*")
        .eq("user_id", user.id)
        .single();
      exportData.wallet = wallet;

      // Collect identity verification data
      const { data: verifications } = await supabase
        .from("user_verifications")
        .select("*")
        .eq("user_id", user.id);
      exportData.verifications = verifications || [];

      // Collect custom requests
      const { data: customRequests } = await supabase
        .from("custom_requests")
        .select("*")
        .eq("user_id", user.id);
      exportData.customRequests = customRequests || [];

      // Generate JSON file content
      const jsonContent = JSON.stringify(exportData, null, 2);
      const base64Content = Buffer.from(jsonContent).toString('base64');

      // Create a data URL for immediate download
      // In production, you could upload to Supabase Storage or S3 and generate a signed URL
      const downloadUrl = `data:application/json;base64,${base64Content}`;

      // Update user with ready status
      const { error: readyError } = await supabase
        .from("users")
        .update({
          data_export_ready_at: new Date().toISOString(),
          data_export_download_url: downloadUrl,
        })
        .eq("id", user.id);

      if (readyError) {
        throw readyError;
      }

      return successResponse({
        message: "Your data export is ready for download.",
        requestedAt: new Date().toISOString(),
        downloadUrl: downloadUrl,
        dataSize: jsonContent.length,
        fileName: `beautonomi-data-export-${user.id}-${new Date().toISOString().split('T')[0]}.json`,
      });
    } catch (exportError) {
      // If export generation fails, still mark as requested but log error
      console.error("Data export generation error:", exportError);
      return successResponse({
        message: "Your data export request has been submitted. We'll process it and notify you when ready.",
        requestedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    return handleApiError(error, "Failed to request data export");
  }
}

/**
 * GET /api/me/request-data
 * 
 * Get the status of the current user's data export request
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();

    const { data: userData, error } = await supabase
      .from("users")
      .select("data_export_requested_at, data_export_ready_at, data_export_download_url")
      .eq("id", user.id)
      .single();

    if (error || !userData) {
      return NextResponse.json(
        { error: "Failed to fetch data export status" },
        { status: 404 }
      );
    }

    const response = {
      requestedAt: userData.data_export_requested_at,
      readyAt: userData.data_export_ready_at,
      downloadUrl: userData.data_export_download_url || undefined,
      fileName: userData.data_export_download_url 
        ? `beautonomi-data-export-${userData.data_export_requested_at?.split('T')[0] || new Date().toISOString().split('T')[0]}.json`
        : undefined,
      isReady: !!userData.data_export_ready_at && !!userData.data_export_download_url,
      isPending: !!userData.data_export_requested_at && !userData.data_export_ready_at,
    };

    return successResponse(response);
  } catch (error) {
    return handleApiError(error, "Failed to fetch data export status");
  }
}
