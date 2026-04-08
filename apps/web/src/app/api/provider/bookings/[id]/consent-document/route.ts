import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getStorageServiceClientOrUser } from "@/lib/supabase/storage-service-client";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";

const BUCKET = "booking-documents";
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * POST /api/provider/bookings/[id]/consent-document
 * Upload a consent/waiver document for a booking. Stores file in booking-documents and
 * saves URL in bookings.provider_form_responses[formId]._consent_document_url.
 * Body: multipart with form_id (UUID), file (single file).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id: bookingId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: booking, error: bookError } = await supabase
      .from("bookings")
      .select("id, provider_id, provider_form_responses")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();

    if (bookError || !booking) return notFoundResponse("Booking not found");

    const formData = await request.formData();
    const formId = formData.get("form_id") as string | null;
    const file = formData.get("file") as File | null;

    if (!formId?.trim()) {
      return errorResponse("form_id is required", "VALIDATION_ERROR", 400);
    }
    if (!file || !(file instanceof File) || file.size === 0) {
      return errorResponse("file is required", "VALIDATION_ERROR", 400);
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return errorResponse("Invalid file type. Allowed: PDF, JPEG, PNG, WebP, GIF.", "VALIDATION_ERROR", 400);
    }
    if (file.size > MAX_SIZE) {
      return errorResponse("File size exceeds 5MB limit", "VALIDATION_ERROR", 413);
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const safeExt = ["pdf", "jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "bin";
    const suffix = Math.random().toString(36).slice(2, 10);
    const path = `${Date.now()}-${bookingId}/consent-${formId}-${suffix}.${safeExt}`;

    const storageClient = getStorageServiceClientOrUser(supabase);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await storageClient.storage.from(BUCKET).upload(path, buffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

    if (uploadError) {
      console.error("Consent document upload error:", uploadError);
      return handleApiError(uploadError, "Failed to upload document");
    }

    const { data: { publicUrl } } = storageClient.storage.from(BUCKET).getPublicUrl(path);

    const responses = (booking.provider_form_responses as Record<string, Record<string, unknown>>) || {};
    const formFields = responses[formId] || {};
    const updated = { ...formFields, _consent_document_url: publicUrl };
    const newResponses = { ...responses, [formId]: updated };

    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        provider_form_responses: newResponses,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .eq("provider_id", providerId);

    if (updateError) throw updateError;

    return successResponse({ url: publicUrl, formId });
  } catch (error) {
    return handleApiError(error, "Failed to upload consent document");
  }
}
