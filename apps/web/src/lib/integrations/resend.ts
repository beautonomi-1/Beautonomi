import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResendCredentials {
  apiKey: string;
  fromAddress: string;
}

export const DEFAULT_RESEND_FROM = "Beautonomi <notifications@beautonomi.app>";

/**
 * Resolve Resend credentials for a tenant.
 * Priority: platform_secrets (tenant row → global row) → environment variables.
 */
export async function resolveResendCredentials(
  supabase: SupabaseClient,
  tenantId?: string | null,
): Promise<ResendCredentials | null> {
  let apiKey = "";
  let fromAddress = "";

  const loadRow = async (scopeTenantId: string | null) => {
    let query = supabase
      .from("platform_secrets")
      .select("resend_api_key, resend_from_address")
      .order("updated_at", { ascending: false })
      .limit(1);
    query = scopeTenantId == null ? query.is("tenant_id", null) : query.eq("tenant_id", scopeTenantId);
    const { data } = await query.maybeSingle();
    return data as { resend_api_key?: string | null; resend_from_address?: string | null } | null;
  };

  try {
    if (tenantId) {
      const tenantRow = await loadRow(tenantId);
      if (tenantRow) {
        apiKey = tenantRow.resend_api_key?.trim() || "";
        fromAddress = tenantRow.resend_from_address?.trim() || "";
      }
      if (!apiKey) {
        const globalRow = await loadRow(null);
        if (globalRow) {
          apiKey = globalRow.resend_api_key?.trim() || "";
          fromAddress = fromAddress || globalRow.resend_from_address?.trim() || "";
        }
      }
    } else {
      const globalRow = await loadRow(null);
      if (globalRow) {
        apiKey = globalRow.resend_api_key?.trim() || "";
        fromAddress = globalRow.resend_from_address?.trim() || "";
      }
    }
  } catch {
    // DB columns may not exist yet in dev
  }

  apiKey =
    apiKey ||
    process.env.RESEND_API_KEY?.trim() ||
    process.env.EMAIL_PROVIDER_API_KEY?.trim() ||
    "";
  fromAddress =
    fromAddress ||
    process.env.EMAIL_FROM_ADDRESS?.trim() ||
    DEFAULT_RESEND_FROM;

  if (!apiKey) return null;

  return { apiKey, fromAddress };
}

export async function sendResendEmail(params: {
  supabase: SupabaseClient;
  tenantId?: string | null;
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  headers?: Record<string, string>;
}): Promise<void> {
  const creds = await resolveResendCredentials(params.supabase, params.tenantId);
  if (!creds) {
    throw new Error("email provider not configured (Resend API key missing)");
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from ?? creds.fromAddress,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      headers: params.headers,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`email send failed (${resp.status}): ${detail.slice(0, 400)}`);
  }
}
