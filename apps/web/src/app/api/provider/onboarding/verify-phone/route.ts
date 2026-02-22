import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireAuthInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { sendToUser } from "@/lib/notifications/onesignal";

/**
 * POST /api/provider/onboarding/verify-phone
 * Send verification code to phone number
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const body = await request.json();
    const { phone } = body;

    if (!phone) {
      return handleApiError(
        new Error("Phone number is required"),
        "Phone number is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Generate 4-digit verification code
    const verificationCode = Math.floor(1000 + Math.random() * 9000).toString();
    
    const supabase = await getSupabaseServer(request);
    
    // Store verification code with expiration (5 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    // Store verification code in the database
    const { error: storeError } = await supabase
      .from("users")
      .update({
        phone_verification_code: verificationCode,
        phone_verification_expires: expiresAt.toISOString(),
      })
      .eq("id", user.id);

    if (storeError) {
      console.error("Failed to store verification code:", storeError);
    }
    
    // Send SMS with verification code
    try {
      const result = await sendToUser(
        user.id,
        {
          title: "Beautonomi Verification",
          message: `Your verification code is: ${verificationCode}. This code expires in 5 minutes.`,
          type: "sms",
        },
        ["sms"]
      );

      if (!result.success) {
        console.error("Failed to send SMS:", result.error);
        // For development, return code in response (remove in production)
        return successResponse({
          code: process.env.NODE_ENV === "development" ? verificationCode : undefined,
          message: "Verification code sent",
          expires_in: 300, // 5 minutes
        });
      }

      // In production, store code securely (Redis, database, etc.)
      // For now, return success (code should be stored server-side)
      return successResponse({
        message: "Verification code sent",
        expires_in: 300,
      });
    } catch (smsError) {
      // If SMS fails, still return code in development
      console.error("SMS sending error:", smsError);
      return successResponse({
        code: process.env.NODE_ENV === "development" ? verificationCode : undefined,
        message: "Verification code generated (SMS may have failed)",
        expires_in: 300,
      });
    }
  } catch (error) {
    return handleApiError(error, "Failed to send verification code");
  }
}

/**
 * POST /api/provider/onboarding/verify-phone/verify
 * Verify the code entered by user
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const body = await request.json();
    const { phone, code } = body;

    if (!phone || !code) {
      return handleApiError(
        new Error("Phone and code are required"),
        "Phone and code are required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Validate code format
    if (!/^\d{4}$/.test(code)) {
      return handleApiError(
        new Error("Invalid verification code format"),
        "Invalid verification code format",
        "VALIDATION_ERROR",
        400
      );
    }

    // Fetch the stored verification code
    const supabase = await getSupabaseServer(request);
    const { data: userData, error: fetchError } = await supabase
      .from("users")
      .select("phone_verification_code, phone_verification_expires")
      .eq("id", user.id)
      .single();

    if (fetchError) {
      return handleApiError(fetchError, "Failed to fetch verification data");
    }

    if (!userData?.phone_verification_code) {
      return handleApiError(
        new Error("No verification code found. Please request a new one."),
        "No verification code found",
        "VALIDATION_ERROR",
        400
      );
    }

    // Check expiration
    if (new Date() > new Date(userData.phone_verification_expires)) {
      return handleApiError(
        new Error("Verification code has expired. Please request a new one."),
        "Code expired",
        "VALIDATION_ERROR",
        400
      );
    }

    // Verify code matches
    if (code !== userData.phone_verification_code) {
      return handleApiError(
        new Error("Invalid verification code"),
        "Invalid code",
        "VALIDATION_ERROR",
        400
      );
    }

    // Clear verification code after successful verification and update phone
    const { error: updateError } = await supabase
      .from("users")
      .update({
        phone: phone,
        phone_verified: true,
        phone_verified_at: new Date().toISOString(),
        phone_verification_code: null,
        phone_verification_expires: null,
      })
      .eq("id", user.id);

    if (updateError) {
      return handleApiError(updateError, "Failed to update phone number");
    }

    return successResponse({
      verified: true,
      message: "Phone number verified successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to verify code");
  }
}
