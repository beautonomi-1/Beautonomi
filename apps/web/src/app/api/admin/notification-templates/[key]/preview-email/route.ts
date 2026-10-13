import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { finalizeTemplateEmailHtml } from "@/lib/email/finalize-notification-email";
import { resolvePushUrlFields } from "@/lib/notifications/push-url";

function substituteMergeTags(text: string, variables: Record<string, string>): string {
  let out = text;
  for (const [key, value] of Object.entries(variables)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

function sampleVariables(keys: string[] | null | undefined): Record<string, string> {
  const samples: Record<string, string> = {
    provider_name: "Sample Salon",
    customer_name: "Alex Customer",
    sender_name: "Alex Customer",
    booking_date: "Mon, Jan 12, 2026",
    booking_time: "2:30 PM",
    new_date: "Tue, Jan 13, 2026",
    new_time: "3:00 PM",
    old_date: "Mon, Jan 12, 2026",
    old_time: "2:30 PM",
    services: "Haircut, Blowout",
    total_amount: "$85.00",
    booking_number: "BN-10042",
    booking_id: "00000000-0000-4000-8000-000000000001",
    location: "123 Main St, Cape Town",
    amount: "$85.00",
    payment_method: "Card",
    transaction_id: "TXN-SAMPLE",
    failure_reason: "Insufficient funds",
    refund_info: "A full refund will be issued within 3–5 business days.",
    refund_reason: "Customer cancellation",
    message_preview: "See you tomorrow!",
    pricing_breakdown_html: "",
    app_url: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://app.beautonomi.com",
    business_name: "Sample Salon",
    plan_name: "Pro",
    rating: "5",
    review_text: "Great service!",
  };
  const out: Record<string, string> = {};
  for (const key of keys ?? []) {
    out[key] = samples[key] ?? `[${key}]`;
  }
  return out;
}

/**
 * POST /api/admin/notification-templates/[key]/preview-email
 * Returns finalized { html, text } without sending mail.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const { key } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      variables?: Record<string, string>;
      emailSubject?: string;
      emailBody?: string;
      url?: string | null;
    };

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    let template: {
      key: string;
      email_subject: string | null;
      email_body: string | null;
      body: string | null;
      url: string | null;
      variables: string[] | null;
    } | null = null;

    if (tenantId) {
      const tenantRow = await supabase
        .from("notification_templates")
        .select("key, email_subject, email_body, body, url, variables")
        .eq("key", key)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (tenantRow.error) throw tenantRow.error;
      template = tenantRow.data;
    }

    if (!template) {
      const globalRow = await supabase
        .from("notification_templates")
        .select("key, email_subject, email_body, body, url, variables")
        .eq("key", key)
        .is("tenant_id", null)
        .maybeSingle();
      if (globalRow.error) throw globalRow.error;
      template = globalRow.data;
    }

    if (!template) {
      return handleApiError(new Error("Template not found"), "Template not found");
    }

    const vars = {
      ...sampleVariables(template.variables as string[] | undefined),
      ...(body.variables ?? {}),
    };

    const rawSubject =
      body.emailSubject?.trim() ||
      (template.email_subject as string | null)?.trim() ||
      "Beautonomi notification";
    const rawHtml =
      body.emailBody?.trim() ||
      (template.email_body as string | null)?.trim() ||
      (template.body as string | null)?.trim() ||
      "";

    const emailSubject = substituteMergeTags(rawSubject, vars);
    const emailBody = substituteMergeTags(rawHtml, vars);

    const urlTemplate =
      body.url !== undefined ? body.url : (template.url as string | null) ?? "";
    const pushUrl = urlTemplate
      ? resolvePushUrlFields(urlTemplate, vars).webUrl
      : undefined;

    const { html, text } = finalizeTemplateEmailHtml({
      emailSubject,
      emailBody,
      ctaHref: pushUrl,
    });

    return successResponse({ html, text, subject: emailSubject });
  } catch (error) {
    return handleApiError(error, "Failed to preview notification email");
  }
}
