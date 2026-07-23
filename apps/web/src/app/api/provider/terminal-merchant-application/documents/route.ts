import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logTerminalMerchantApplicationEvent } from "@/lib/terminal-merchant/events";
import type { TerminalMerchantDocType } from "@/lib/terminal-merchant/types";

const bodySchema = z.object({
  doc_type: z.enum([
    "id_document",
    "proof_of_address",
    "bank_confirmation_letter",
    "company_registration",
    "trust_deed",
    "resolution_letter",
    "other",
  ]),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
  content_base64: z.string().min(1),
});

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/provider/terminal-merchant-application/documents
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);
    }

    const { data: application } = await admin
      .from("terminal_merchant_applications")
      .select("id, status")
      .eq("provider_id", providerId)
      .eq("vendor_slug", "paycloud")
      .not("status", "in", '("approved","declined","cancelled")')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!application) return errorResponse("No application found", "NOT_FOUND", 404);
    if (!["draft", "info_required"].includes(String(application.status))) {
      return errorResponse("Cannot upload documents in current status", "INVALID_STATUS", 400);
    }

    const buffer = Buffer.from(parsed.data.content_base64, "base64");
    if (buffer.length > MAX_BYTES) {
      return errorResponse("File too large (max 10MB)", "FILE_TOO_LARGE", 400);
    }

    const ext = parsed.data.file_name?.split(".").pop()?.toLowerCase() ?? "jpg";
    const docType = parsed.data.doc_type as TerminalMerchantDocType;
    const path = `${application.id}/${docType}-${Date.now()}.${ext}`;

    const { error: uploadErr } = await admin.storage
      .from("merchant-onboarding-documents")
      .upload(path, buffer, {
        contentType: parsed.data.mime_type ?? "application/octet-stream",
        upsert: false,
      });

    if (uploadErr) {
      if (uploadErr.message?.includes("Bucket not found")) {
        return errorResponse(
          "Document storage is not configured. Contact support.",
          "STORAGE_NOT_CONFIGURED",
          503,
        );
      }
      throw uploadErr;
    }

    await admin
      .from("terminal_merchant_application_documents")
      .delete()
      .eq("application_id", application.id)
      .eq("doc_type", docType);

    const { data: doc, error: docErr } = await admin
      .from("terminal_merchant_application_documents")
      .insert({
        application_id: application.id,
        doc_type: docType,
        storage_path: path,
        file_name: parsed.data.file_name ?? null,
        mime_type: parsed.data.mime_type ?? null,
        status: "pending",
        uploaded_by: user.id,
      })
      .select("*")
      .single();

    if (docErr) throw docErr;

    await logTerminalMerchantApplicationEvent(admin, {
      applicationId: application.id,
      eventType: "document_uploaded",
      actorUserId: user.id,
      actorRole: user.role ?? "provider_owner",
      message: `Uploaded ${docType}`,
      payload: { doc_type: docType, document_id: doc.id },
    });

    return successResponse({ document: doc }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to upload document");
  }
}

/**
 * DELETE /api/provider/terminal-merchant-application/documents?doc_id=
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const docId = new URL(request.url).searchParams.get("doc_id");
    if (!docId) return errorResponse("doc_id required", "VALIDATION_ERROR", 400);

    const { data: doc } = await admin
      .from("terminal_merchant_application_documents")
      .select("*, terminal_merchant_applications!inner(provider_id, status)")
      .eq("id", docId)
      .maybeSingle();

    if (!doc) return errorResponse("Document not found", "NOT_FOUND", 404);

    const app = (doc as any).terminal_merchant_applications;
    if (app.provider_id !== providerId) return errorResponse("Forbidden", "FORBIDDEN", 403);
    if (!["draft", "info_required"].includes(String(app.status))) {
      return errorResponse("Cannot delete document in current status", "INVALID_STATUS", 400);
    }

    await admin.storage.from("merchant-onboarding-documents").remove([(doc as any).storage_path]);
    await admin.from("terminal_merchant_application_documents").delete().eq("id", docId);

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete document");
  }
}
