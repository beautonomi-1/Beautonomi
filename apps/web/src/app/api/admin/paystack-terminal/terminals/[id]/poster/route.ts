import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { errorResponse, handleApiError, requireAdminSection, successResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { computePaystackTerminalAssetStatus } from "@/lib/payments/paystack-terminal-assets";
import {
  providerBelongsToTenantScope,
  resolvePaystackTerminalTenantScope,
} from "@/lib/admin/paystack-terminal-tenant-scope";

const POSTER_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

function isAllowedPosterMime(type: string) {
  const normalized = type.toLowerCase().split(";")[0]?.trim() || "";
  return (
    normalized === "image/jpeg" ||
    normalized === "image/jpg" ||
    normalized === "image/png" ||
    normalized === "image/webp" ||
    normalized === "application/pdf"
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const { id } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return errorResponse("file is required", "VALIDATION_ERROR", 400);
    if (file.size <= 0) return errorResponse("Poster file is empty", "VALIDATION_ERROR", 400);
    if (file.size > POSTER_UPLOAD_MAX_BYTES) {
      return errorResponse("Poster file must be 10MB or smaller", "FILE_TOO_LARGE", 400);
    }
    const contentType = file.type || "application/octet-stream";
    if (!isAllowedPosterMime(contentType)) {
      return errorResponse("Only JPEG, PNG, WebP, and PDF posters are allowed", "INVALID_FILE_TYPE", 400);
    }

    const supabase = getSupabaseAdmin();
    const tenantScope = await resolvePaystackTerminalTenantScope(supabase, request);
    const { data: terminal, error: terminalError } = await (supabase
      .from("provider_paystack_virtual_terminals") as any)
      .select("id, provider_id, terminal_code, payment_link, terminal_url, qr_url")
      .eq("id", id)
      .maybeSingle();
    if (terminalError) throw terminalError;
    if (!terminal || !providerBelongsToTenantScope(terminal.provider_id, tenantScope)) {
      return errorResponse("Terminal not found", "NOT_FOUND", 404);
    }

    const fileExt =
      file.name.split(".").pop()?.toLowerCase() ||
      (contentType === "application/pdf" ? "pdf" : contentType.split("/")[1]) ||
      "bin";
    const storagePath = `${terminal.provider_id}/paystack-terminal/${terminal.terminal_code}/poster-${Date.now()}.${fileExt}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("provider-gallery")
      .upload(storagePath, buffer, {
        contentType,
        cacheControl: "3600",
        upsert: true,
      });
    if (uploadError || !uploadData?.path) throw uploadError ?? new Error("Upload failed");
    const {
      data: { publicUrl },
    } = supabase.storage.from("provider-gallery").getPublicUrl(uploadData.path);

    const assetStatus = computePaystackTerminalAssetStatus({
      payment_link: terminal.payment_link,
      terminal_url: terminal.terminal_url,
      qr_url: terminal.qr_url,
      poster_url: publicUrl,
    });
    const { data, error } = await (supabase
      .from("provider_paystack_virtual_terminals") as any)
      .update({
        poster_url: publicUrl,
        poster_storage_path: uploadData.path,
        poster_uploaded_by: user.id,
        poster_uploaded_at: new Date().toISOString(),
        asset_status: assetStatus,
        asset_completed_at: assetStatus === "ready" ? new Date().toISOString() : null,
        asset_completed_by: assetStatus === "ready" ? user.id : null,
        asset_request_status: assetStatus === "ready" ? "completed" : "in_progress",
        asset_request_completed_at: assetStatus === "ready" ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to upload Paystack Terminal poster");
  }
}
