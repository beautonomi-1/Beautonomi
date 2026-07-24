import { NextRequest } from "next/server";
import {
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { decryptAccountNumberForExport } from "@/lib/terminal-merchant/events";

type RouteParams = { params: Promise<{ id: string }> };

import { requireTerminalMerchantAdmin } from "@/lib/terminal-merchant/admin-auth";

/**
 * GET /api/admin/terminal-merchant-applications/[id]/export
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireTerminalMerchantAdmin(request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: application } = await supabase
      .from("terminal_merchant_applications")
      .select("*, providers(business_name, email, phone)")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!application) return errorResponse("Application not found", "NOT_FOUND", 404);

    const { data: documents } = await supabase
      .from("terminal_merchant_application_documents")
      .select("*")
      .eq("application_id", id);

    const docUrls: Record<string, string> = {};
    for (const doc of documents ?? []) {
      const { data: signed } = await supabase.storage
        .from("merchant-onboarding-documents")
        .createSignedUrl((doc as { storage_path: string }).storage_path, 3600);
      if (signed?.signedUrl) {
        docUrls[(doc as { id: string }).id] = signed.signedUrl;
      }
    }

    const pack = {
      application_no: application.application_no,
      exported_at: new Date().toISOString(),
      personal: {
        first_name: application.first_name,
        last_name: application.last_name,
        email: application.email,
        phone: application.phone,
        id_type: application.id_type,
        id_number: application.id_number,
        otp_phone: application.otp_phone,
      },
      business: {
        entity_type: application.entity_type,
        legal_name: application.legal_name,
        trading_name: application.trading_name,
        registration_number: application.registration_number,
        vat_number: application.vat_number,
        mcc: application.mcc,
      },
      addresses: {
        physical: {
          line1: application.physical_line1,
          suburb: application.physical_suburb,
          city: application.physical_city,
          province: application.physical_province,
          postal_code: application.physical_postal_code,
          country: application.physical_country,
        },
        postal_same_as_physical: application.postal_same_as_physical,
        postal: application.postal_same_as_physical
          ? null
          : {
              line1: application.postal_line1,
              suburb: application.postal_suburb,
              city: application.postal_city,
              province: application.postal_province,
              postal_code: application.postal_postal_code,
              country: application.postal_country,
            },
      },
      banking: {
        bank_code: application.bank_code,
        bank_name: application.bank_name,
        account_type: application.account_type,
        account_holder: application.account_holder,
        account_number: decryptAccountNumberForExport(application.account_number_encrypted),
        account_number_last4: application.account_number_last4,
      },
      fulfillment: {
        method: application.fulfillment_method,
        delivery: {
          line1: application.delivery_line1,
          suburb: application.delivery_suburb,
          city: application.delivery_city,
          province: application.delivery_province,
          postal_code: application.delivery_postal_code,
          country: application.delivery_country,
        },
        collection_location_id: application.collection_location_id,
      },
      documents: (documents ?? []).map((d) => ({
        id: (d as { id: string }).id,
        doc_type: (d as { doc_type: string }).doc_type,
        file_name: (d as { file_name?: string }).file_name,
        status: (d as { status: string }).status,
        signed_url: docUrls[(d as { id: string }).id] ?? null,
      })),
      acquirer_reference: application.acquirer_reference,
    };

    const format = new URL(request.url).searchParams.get("format");
    if (format === "json") {
      return new Response(JSON.stringify(pack, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${application.application_no}.json"`,
        },
      });
    }

    return successResponse({ pack });
  } catch (error) {
    return handleApiError(error, "Failed to export application");
  }
}
