import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { ZOHO_MAIL_DATA_CENTERS } from "@/lib/integrations/zoho-mail";
import { saveZohoGrantCode, testZohoMailboxConnection } from "@/lib/integrations/zoho-mail-test-connection";

const connectionPatchSchema = z.object({
  id: z.string().uuid().optional(),
  data_center: z.string().url().optional(),
  enabled: z.boolean().optional(),
  poll_page_cap: z.number().int().min(1).max(5).optional(),
  max_messages_per_run: z.number().int().min(1).max(100).optional(),
  html_retention_days: z.number().int().min(1).max(365).optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  grant_code: z.string().optional(),
});

const mailboxPatchSchema = z.object({
  id: z.string().uuid().optional(),
  connection_id: z.string().uuid(),
  address: z.string().email(),
  tenant_id: z.string().uuid(),
  inbound_enabled: z.boolean().optional(),
  outbound_enabled: z.boolean().optional(),
  ack_enabled: z.boolean().optional(),
  ack_subject: z.string().max(500).optional(),
  ack_body: z.string().max(5000).optional(),
  lookback_hours: z.number().int().min(0).max(168).optional(),
  inbox_folder_id: z.string().optional(),
  default_category: z.string().optional(),
  blocked_senders: z.array(z.string().email()).optional(),
  rotate_webhook_token: z.boolean().optional(),
});

function maskSecret(v: string | null | undefined): boolean {
  return !!v?.trim();
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const supabase = getSupabaseAdmin();
    const { data: connections, error: cErr } = await supabase
      .from("support_zoho_connections")
      .select(
        "id, data_center, enabled, auth_status, poll_page_cap, max_messages_per_run, html_retention_days, client_id, zoho_account_id, last_error, updated_at, access_token_expires_at",
      )
      .order("created_at", { ascending: true });
    if (cErr) throw cErr;

    const { data: mailboxes, error: mErr } = await supabase
      .from("support_mailboxes")
      .select(
        "*, tenant:tenants(id, name, slug, region_code, default_language)",
      )
      .order("address", { ascending: true });
    if (mErr) throw mErr;

    const { data: secrets } = await supabase
      .from("support_zoho_connections")
      .select("id, client_secret, refresh_token");

    const secretMap = new Map(
      (secrets ?? []).map((s) => [
        (s as { id: string }).id,
        s as { client_secret?: string; refresh_token?: string },
      ]),
    );

    const safeConnections = (connections ?? []).map((c) => {
      const sec = secretMap.get((c as { id: string }).id);
      return {
        ...c,
        has_client_secret: maskSecret(sec?.client_secret),
        has_refresh_token: maskSecret(sec?.refresh_token),
      };
    });

    const { data: quarantine } = await supabase
      .from("support_mail_messages")
      .select("id, mailbox_id, from_address, subject, skip_reason, delivery_status, received_at, delivery_error")
      .is("ticket_id", null)
      .in("delivery_status", ["skipped", "failed"])
      .order("received_at", { ascending: false })
      .limit(50);

    return successResponse({
      data_centers: Object.values(ZOHO_MAIL_DATA_CENTERS),
      connections: safeConnections,
      mailboxes: mailboxes ?? [],
      quarantine: quarantine ?? [],
      limits_note:
        "Replies sent from the Zoho web client are not ingested. Staff must reply from the support desk.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to load Zoho Mail integration");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const supabase = getSupabaseAdmin();
    const body = await request.json();
    const kind = String(body?.kind ?? "connection");

    if (kind === "mailbox") {
      const parsed = mailboxPatchSchema.safeParse(body);
      if (!parsed.success) return errorResponse("Invalid mailbox payload", "VALIDATION", 400);
      const p = parsed.data;
      const payload: Record<string, unknown> = {
        connection_id: p.connection_id,
        address: p.address.trim().toLowerCase(),
        tenant_id: p.tenant_id,
        updated_at: new Date().toISOString(),
      };
      for (const key of [
        "inbound_enabled",
        "outbound_enabled",
        "ack_enabled",
        "ack_subject",
        "ack_body",
        "lookback_hours",
        "inbox_folder_id",
        "blocked_senders",
      ] as const) {
        if (p[key] !== undefined) payload[key] = p[key];
      }
      if (p.default_category !== undefined) {
        const { validateAdminCategoryValue } = await import("@/lib/support/ticket-categories");
        const cat = validateAdminCategoryValue(p.default_category);
        if (!cat.ok) {
          return errorResponse("Invalid default_category", "VALIDATION", 400);
        }
        payload.default_category = cat.category;
      }
      if (p.rotate_webhook_token) {
        payload.webhook_token = randomBytes(24).toString("hex");
      }
      if (p.inbound_enabled === true) {
        const test = await testZohoMailboxConnection(supabase, {
          connectionId: p.connection_id,
          mailboxAddress: p.address.trim().toLowerCase(),
        });
        if (!test.ok) {
          return errorResponse(
            test.error ?? "Mailbox address must pass Zoho connection test before inbound is enabled",
            "VALIDATION",
            400,
          );
        }
        if (test.inboxFolderId && p.inbox_folder_id === undefined) {
          payload.inbox_folder_id = test.inboxFolderId;
        }
      }
      let row;
      if (p.id) {
        const { data, error } = await supabase
          .from("support_mailboxes")
          .update(payload)
          .eq("id", p.id)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        row = data;
      } else {
        const { data, error } = await supabase
          .from("support_mailboxes")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        row = data;
      }
      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: (user as { role?: string }).role ?? "admin",
        action: p.id ? "admin.integrations.zoho_mailbox.updated" : "admin.integrations.zoho_mailbox.created",
        entity_type: "support_mailboxes",
        entity_id: (row as { id: string }).id,
        metadata: { address: p.address },
      });
      return successResponse({ id: (row as { id: string }).id });
    }

    const parsed = connectionPatchSchema.safeParse(body);
    if (!parsed.success) return errorResponse("Invalid connection payload", "VALIDATION", 400);
    const p = parsed.data;
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of [
      "data_center",
      "enabled",
      "poll_page_cap",
      "max_messages_per_run",
      "html_retention_days",
      "client_id",
      "client_secret",
    ] as const) {
      if (p[key] !== undefined && p[key] !== "") payload[key] = p[key];
    }

    let connectionId = p.id;
    if (connectionId) {
      const { error } = await supabase.from("support_zoho_connections").update(payload).eq("id", connectionId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("support_zoho_connections")
        .insert({
          data_center: p.data_center ?? ZOHO_MAIL_DATA_CENTERS.US,
          ...payload,
        })
        .select("id")
        .single();
      if (error) throw error;
      connectionId = (data as { id: string }).id;
    }

    if (p.grant_code?.trim() && connectionId) {
      const exchanged = await saveZohoGrantCode(supabase, connectionId, p.grant_code.trim());
      if (!exchanged.ok) {
        return errorResponse(exchanged.error ?? "Grant exchange failed", "ZOHO_GRANT", 400);
      }
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "admin",
      action: p.id ? "admin.integrations.zoho_connection.updated" : "admin.integrations.zoho_connection.created",
      entity_type: "support_zoho_connections",
      entity_id: connectionId!,
    });

    return successResponse({ id: connectionId });
  } catch (error) {
    return handleApiError(error, "Failed to save Zoho Mail integration");
  }
}
