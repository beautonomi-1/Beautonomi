/**
 * Twilio Content API — create, submit, sync WhatsApp templates.
 * @see https://www.twilio.com/docs/content/content-api-resources
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTwilioCredentials, type TwilioCredentials } from "@/lib/integrations/twilio";
import {
  validateWhatsAppApprovalReadiness,
  type WhatsAppCategory,
} from "@/lib/whatsapp/approval-readiness";

const CONTENT_BASE = "https://content.twilio.com/v1";

export type ContentVariableMapping = {
  ordinal: number;
  var: string;
  sample?: string;
};

export type NotificationTemplateWhatsAppRow = {
  id: string;
  key: string;
  body: string;
  whatsapp_body?: string | null;
  whatsapp_content_sid?: string | null;
  whatsapp_content_variables?: ContentVariableMapping[] | null;
  whatsapp_category?: WhatsAppCategory | string | null;
  whatsapp_template_status?: string | null;
  whatsapp_approval_name?: string | null;
  whatsapp_language?: string | null;
  whatsapp_content_type?: string | null;
  whatsapp_content_definition?: Record<string, unknown> | null;
  whatsapp_content_hash?: string | null;
  whatsapp_content_error?: string | null;
  variables?: string[] | null;
};

function authHeader(creds: TwilioCredentials): string {
  return `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`;
}

function namedToOrdinalBody(
  body: string,
  mappings: ContentVariableMapping[],
): { body: string; samples: Record<string, string> } {
  let out = body;
  const samples: Record<string, string> = {};
  const sorted = [...mappings].sort((a, b) => a.ordinal - b.ordinal);
  for (const m of sorted) {
    const name = m.var?.trim();
    if (!name) continue;
    out = out.replace(new RegExp(`\\{\\{${name}\\}\\}`, "g"), `{{${m.ordinal}}}`);
    samples[String(m.ordinal)] = m.sample?.trim() || `Sample ${m.ordinal}`;
  }
  // Also replace any remaining {{n}} with samples from ordinals in body
  const ordMatches = out.match(/\{\{(\d+)\}\}/g) ?? [];
  for (const match of ordMatches) {
    const n = match.replace(/\D/g, "");
    if (!samples[n]) {
      const map = sorted.find((s) => String(s.ordinal) === n);
      samples[n] = map?.sample?.trim() || `Sample ${n}`;
    }
  }
  return { body: out, samples };
}

function computeContentHash(template: NotificationTemplateWhatsAppRow): string {
  const payload = JSON.stringify({
    body: template.whatsapp_body || template.body,
    type: template.whatsapp_content_type,
    def: template.whatsapp_content_definition,
    vars: template.whatsapp_content_variables,
    cat: template.whatsapp_category,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

function buildTypesObject(
  template: NotificationTemplateWhatsAppRow,
  ordinalBody: string,
): Record<string, unknown> {
  const contentType = template.whatsapp_content_type || "twilio/text";
  const def = template.whatsapp_content_definition ?? {};

  if (contentType === "twilio/media") {
    return {
      "twilio/media": {
        body: ordinalBody,
        media: [(def as { media_url?: string }).media_url || ""].filter(Boolean),
      },
    };
  }

  if (contentType === "twilio/call-to-action") {
    const actions = (def as { actions?: Array<Record<string, string>> }).actions ?? [];
    return {
      "twilio/call-to-action": {
        body: ordinalBody,
        actions,
      },
    };
  }

  if (contentType === "twilio/quick-reply") {
    const actions = (def as { actions?: Array<Record<string, string>> }).actions ?? [];
    return {
      "twilio/quick-reply": {
        body: ordinalBody,
        actions,
      },
    };
  }

  if (contentType === "twilio/authentication") {
    return {
      "twilio/authentication": {
        add_security_recommendation: true,
        code_expiration_minutes: (def as { code_expiration_minutes?: number }).code_expiration_minutes ?? 10,
      },
    };
  }

  return {
    "twilio/text": { body: ordinalBody },
  };
}

export function buildContentPayload(template: NotificationTemplateWhatsAppRow): {
  friendly_name: string;
  language: string;
  variables: Record<string, string>;
  types: Record<string, unknown>;
} {
  const rawBody = (template.whatsapp_body || template.body || "").trim();
  const mappings: ContentVariableMapping[] = Array.isArray(template.whatsapp_content_variables)
    ? template.whatsapp_content_variables
    : [];

  // Auto-build mappings from template.variables if empty
  let effectiveMappings = mappings;
  if (effectiveMappings.length === 0 && template.variables?.length) {
    effectiveMappings = template.variables.map((v, i) => ({
      ordinal: i + 1,
      var: v,
      sample: `Sample ${v}`,
    }));
  }

  const { body: ordinalBody, samples } = namedToOrdinalBody(rawBody, effectiveMappings);
  const friendly_name =
    template.whatsapp_approval_name?.trim() ||
    template.key.replace(/[^a-z0-9]+/gi, "_").toLowerCase();

  return {
    friendly_name,
    language: template.whatsapp_language || "en",
    variables: samples,
    types: buildTypesObject(template, ordinalBody),
  };
}

async function contentFetch(
  creds: TwilioCredentials,
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${CONTENT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      (data.message as string) ||
      (data.error_message as string) ||
      `Twilio Content API error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function pushContentTemplate(
  supabase: SupabaseClient,
  tenantId: string,
  template: NotificationTemplateWhatsAppRow,
): Promise<{ contentSid: string; hash: string }> {
  const readiness = validateWhatsAppApprovalReadiness(template);
  if (readiness.fatal.length > 0) {
    throw new Error(`Approval readiness failed: ${readiness.fatal.join("; ")}`);
  }

  const creds = await resolveTwilioCredentials(supabase, tenantId);
  if (!creds) throw new Error("Twilio credentials not configured");

  const payload = buildContentPayload(template);
  const data = await contentFetch(creds, "/Content", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const contentSid = String(data.sid ?? "");
  if (!contentSid.startsWith("HX")) {
    throw new Error("Unexpected Content SID from Twilio");
  }

  const hash = computeContentHash(template);
  return { contentSid, hash };
}

export async function submitForWhatsAppApproval(
  supabase: SupabaseClient,
  tenantId: string,
  contentSid: string,
  name: string,
  category: WhatsAppCategory,
): Promise<void> {
  const creds = await resolveTwilioCredentials(supabase, tenantId);
  if (!creds) throw new Error("Twilio credentials not configured");

  const twilioCategory = category.toUpperCase();
  await contentFetch(creds, `/Content/${contentSid}/ApprovalRequests/whatsapp`, {
    method: "POST",
    body: JSON.stringify({ name, category: twilioCategory }),
  });
}

export type ApprovalStatus = "unknown" | "draft" | "received" | "pending" | "approved" | "rejected" | "paused" | "disabled";

export async function syncApprovalStatus(
  supabase: SupabaseClient,
  tenantId: string,
  contentSid: string,
): Promise<{ status: ApprovalStatus; rejectionReason?: string }> {
  const creds = await resolveTwilioCredentials(supabase, tenantId);
  if (!creds) throw new Error("Twilio credentials not configured");

  const data = await contentFetch(creds, `/Content/${contentSid}/ApprovalRequests`, {
    method: "GET",
  });

  const whatsapp = (data.whatsapp as Record<string, unknown>) ?? {};
  const rawStatus = String(whatsapp.status ?? "unknown").toLowerCase();

  let status: ApprovalStatus = "unknown";
  if (rawStatus === "approved") status = "approved";
  else if (rawStatus === "rejected") status = "rejected";
  else if (rawStatus === "pending") status = "pending";
  else if (rawStatus === "received") status = "received";
  else if (rawStatus === "paused") status = "paused";
  else if (rawStatus === "disabled") status = "disabled";

  const rejectionReason =
    typeof whatsapp.rejection_reason === "string" ? whatsapp.rejection_reason : undefined;

  return { status, rejectionReason };
}

export async function deleteContentTemplate(
  supabase: SupabaseClient,
  tenantId: string,
  contentSid: string,
): Promise<void> {
  const creds = await resolveTwilioCredentials(supabase, tenantId);
  if (!creds) throw new Error("Twilio credentials not configured");
  await contentFetch(creds, `/Content/${contentSid}`, { method: "DELETE" });
}

export async function listRemoteContent(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Array<{ sid: string; friendly_name?: string; date_created?: string }>> {
  const creds = await resolveTwilioCredentials(supabase, tenantId);
  if (!creds) throw new Error("Twilio credentials not configured");
  const data = await contentFetch(creds, "/Content?PageSize=100", { method: "GET" });
  const contents = (data.contents as Array<Record<string, unknown>>) ?? [];
  return contents.map((c) => ({
    sid: String(c.sid ?? ""),
    friendly_name: typeof c.friendly_name === "string" ? c.friendly_name : undefined,
    date_created: typeof c.date_created === "string" ? c.date_created : undefined,
  }));
}

export function templateNeedsRepush(template: NotificationTemplateWhatsAppRow): boolean {
  if (!template.whatsapp_content_sid) return true;
  const hash = computeContentHash(template);
  return template.whatsapp_content_hash !== hash;
}

export { computeContentHash };
