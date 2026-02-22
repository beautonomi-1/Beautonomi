import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/verification
 * Get current user's verification status
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    // Get user's verification status from users table
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("identity_verified, identity_verification_status, identity_verification_submitted_at, identity_verification_reviewed_at")
      .eq("id", user.id)
      .single();

    if (userError) throw userError;

    // Get all verification records
    const { data: verifications, error: verificationsError } = await supabase
      .from("user_verifications")
      .select("*")
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false });

    if (verificationsError) throw verificationsError;

    return successResponse({
      verified: userData.identity_verified || false,
      status: userData.identity_verification_status || 'pending',
      submitted_at: userData.identity_verification_submitted_at,
      reviewed_at: userData.identity_verification_reviewed_at,
      verifications: verifications || [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch verification status");
  }
}

/**
 * POST /api/me/verification
 * Upload verification document
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const documentType = formData.get('document_type') as string;
    const country = formData.get('country') as string;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!documentType || !country) {
      return NextResponse.json(
        { error: "Document type and country are required" },
        { status: 400 }
      );
    }

    // Validate document type
    const validTypes = ['license', 'passport', 'identity'];
    if (!validTypes.includes(documentType)) {
      return NextResponse.json(
        { error: "Invalid document type" },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, WebP, and PDF are allowed." },
        { status: 400 }
      );
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit." },
        { status: 400 }
      );
    }

    // Generate file path (don't include bucket name in path)
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${user.id}/${documentType}-${Date.now()}.${fileExt}`;
    const filePath = fileName;

    // Convert File to ArrayBuffer for Supabase
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data: _uploadData, error: uploadError } = await supabase.storage
      .from('verification-documents')
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Failed to upload document: ${uploadError.message}`);
    }

    // Get public URL (though documents should be private)
    const { data: { publicUrl } } = supabase.storage
      .from('verification-documents')
      .getPublicUrl(filePath);

    // Create verification record
    const { data: verification, error: verificationError } = await supabase
      .from("user_verifications")
      .insert({
        user_id: user.id,
        document_type: documentType,
        country: country,
        document_url: publicUrl,
        status: 'pending',
      })
      .select()
      .single();

    if (verificationError) throw verificationError;

    // Update user's verification status
    const { error: updateError } = await supabase
      .from("users")
      .update({
        identity_verification_status: 'pending',
        identity_verification_submitted_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) throw updateError;

    return successResponse({
      verification_id: verification.id,
      document_url: publicUrl,
      status: 'pending',
    });
  } catch (error) {
    return handleApiError(error, "Failed to upload verification document");
  }
}
