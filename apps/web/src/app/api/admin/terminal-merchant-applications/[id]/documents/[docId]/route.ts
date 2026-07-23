import { NextRequest } from "next/server";
import { z } from "zod";
import {
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { logTerminalMerchantApplicationEvent } from "@/lib/terminal-merchant/events";

const patchSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
  rejection_reason: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string; docId: string }> };

import { requireTerminalMerchantAdmin } from "@/lib/terminal-merchant/admin-auth";

/**
 * GET /api/admin/terminal-merchant-applications/[id]/documents/[docId]
 * Returns a short-lived signed URL for viewing the uploaded document.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireTerminalMerchantAdmin(request);
    const { id, docId } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: application } = await supabase
      .from("terminal_merchant_applications")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!application) return errorResponse("Application not found", "NOT_FOUND", 404);

    const { data: doc } = await supabase
      .from("terminal_merchant_application_documents")
      .select("storage_path")
      .eq("id", docId)
      .eq("application_id", id)
      .maybeSingle();
    if (!doc) return errorResponse("Document not found", "NOT_FOUND", 404);

    const { data: signed, error } = await supabase.storage
      .from("merchant-onboarding-documents")
      .createSignedUrl(String((doc as { storage_path: string }).storage_path), 300);
    if (error) throw error;

    return successResponse({ url: signed?.signedUrl ?? null });
  } catch (error) {
    return handleApiError(error, "Failed to load document");
  }
}

/**
 * PATCH /api/admin/terminal-merchant-applications/[id]/documents/[docId]
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireTerminalMerchantAdmin(request);
    const { id, docId } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);
    }

    const { data: application } = await supabase
      .from("terminal_merchant_applications")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!application) return errorResponse("Application not found", "NOT_FOUND", 404);

    const now = new Date().toISOString();
    const { data: doc, error } = await supabase
      .from("terminal_merchant_application_documents")
      .update({
        status: parsed.data.status,
        rejection_reason: parsed.data.rejection_reason ?? null,
        reviewed_by: user.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", docId)
      .eq("application_id", id)
      .select("*")
      .single();
    if (error) throw error;

    await logTerminalMerchantApplicationEvent(supabase, {
      applicationId: id,
      eventType: "document_review",
      actorUserId: user.id,
      actorRole: user.role ?? "admin",
      message: `Document ${parsed.data.status}`,
      payload: { document_id: docId, status: parsed.data.status },
    });

    return successResponse({ document: doc });
  } catch (error) {
    return handleApiError(error, "Failed to review document");
  }
}

/**
 * POST /api/admin/terminal-merchant-applications/[id]/documents/[docId]
 * Staff upload on behalf of merchant (docId = "new")
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireTerminalMerchantAdmin(request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const { data: application } = await supabase
      .from("terminal_merchant_applications")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!application) return errorResponse("Application not found", "NOT_FOUND", 404);

    const docType = String(body.doc_type ?? "other");
    const contentBase64 = String(body.content_base64 ?? "");
    const fileName = String(body.file_name ?? "upload.jpg");
    const mimeType = String(body.mime_type ?? "application/octet-stream");
    if (!contentBase64) return errorResponse("content_base64 required", "VALIDATION_ERROR", 400);

    const buffer = Buffer.from(contentBase64, "base64");
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${id}/${docType}-staff-${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("merchant-onboarding-documents")
      .upload(path, buffer, { contentType: mimeType, upsert: false });
    if (uploadErr) throw uploadErr;

    await supabase
      .from("terminal_merchant_application_documents")
      .delete()
      .eq("application_id", id)
      .eq("doc_type", docType);

    const { data: doc, error: docErr } = await supabase
      .from("terminal_merchant_application_documents")
      .insert({
        application_id: id,
        doc_type: docType,
        storage_path: path,
        file_name: fileName,
        mime_type: mimeType,
        status: "pending",
        uploaded_by: user.id,
      })
      .select("*")
      .single();
    if (docErr) throw docErr;

    await logTerminalMerchantApplicationEvent(supabase, {
      applicationId: id,
      eventType: "document_uploaded_by_staff",
      actorUserId: user.id,
      actorRole: user.role ?? "admin",
      message: `Staff uploaded ${docType}`,
      payload: { document_id: doc.id },
    });

    return successResponse({ document: doc }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to upload document on behalf");
  }
}
