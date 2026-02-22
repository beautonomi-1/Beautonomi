import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/verification/[id]/view
 * Get a signed URL to view a verification document
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const { id } = await params;
    const supabase = await getSupabaseServer();

    // Get verification record
    const { data: verification, error: verificationError } = await supabase
      .from("user_verifications")
      .select("user_id, document_url, status")
      .eq("id", id)
      .single();

    if (verificationError) {
      if (verificationError.code === 'PGRST116') {
        return notFoundResponse("Verification not found");
      }
      throw verificationError;
    }

    // Check if user has permission to view this document
    const isOwner = verification.user_id === user.id;
    const isSuperAdmin = user.role === 'superadmin';

    if (!isOwner && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Extract file path from document_url
    // URL format: https://[project].supabase.co/storage/v1/object/public/verification-documents/[path]
    // or: https://[project].supabase.co/storage/v1/object/sign/verification-documents/[path]?token=...
    let filePath = verification.document_url;
    
    // If it's a public URL, extract the path
    if (filePath.includes('/storage/v1/object/public/')) {
      const parts = filePath.split('/storage/v1/object/public/verification-documents/');
      if (parts.length > 1) {
        filePath = parts[1];
      }
    } else if (filePath.includes('/storage/v1/object/sign/')) {
      // If it's already a signed URL, extract path
      const parts = filePath.split('/storage/v1/object/sign/verification-documents/');
      if (parts.length > 1) {
        filePath = parts[1].split('?')[0]; // Remove query params
      }
    }

    // Generate signed URL (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('verification-documents')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (signedUrlError) {
      // If bucket doesn't exist, return helpful error
      if (signedUrlError.message?.includes('Bucket not found') || signedUrlError.message?.includes('not found')) {
        return NextResponse.json(
          { 
            error: "Storage bucket not configured",
            message: "The verification-documents storage bucket has not been created. Please create it in Supabase Dashboard: Storage > New Bucket > Name: 'verification-documents' > Public: false"
          },
          { status: 503 }
        );
      }
      throw signedUrlError;
    }

    return successResponse({
      signed_url: signedUrlData.signedUrl,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  } catch (error) {
    return handleApiError(error, "Failed to generate document view URL");
  }
}
