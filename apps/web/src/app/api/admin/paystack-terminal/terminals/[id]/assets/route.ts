import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  requireAdminSection,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import {
  assignPaystackVirtualTerminalDestinations,
  unassignPaystackVirtualTerminalDestinations,
  updatePaystackVirtualTerminal,
} from "@/lib/payments/paystack-virtual-terminal";
import {
  computePaystackTerminalAssetStatus,
  isTrustedPaystackTerminalAssetUrl,
  normalizeWhatsAppTarget,
} from "@/lib/payments/paystack-terminal-assets";

const assetUpdateSchema = z.object({
  payment_link: z.string().trim().url().optional().nullable(),
  terminal_url: z.string().trim().url().optional().nullable(),
  qr_url: z.string().trim().url().optional().nullable(),
  poster_url: z.string().trim().url().optional().nullable(),
  poster_storage_path: z.string().trim().optional().nullable(),
  asset_notes: z.string().trim().max(2000).optional().nullable(),
  display_name: z.string().trim().max(160).optional().nullable(),
  paystack_name: z.string().trim().max(160).optional().nullable(),
  paystack_dashboard_url: z.string().trim().url().optional().nullable(),
  notification_whatsapp: z.string().trim().optional().nullable(),
  notification_whatsapp_label: z.string().trim().max(160).optional().nullable(),
  identity_status: z.enum(["needs_review", "verified", "manual_override"]).optional(),
});

function validateTrustedUrls(body: z.infer<typeof assetUpdateSchema>) {
  for (const key of ["payment_link", "terminal_url", "qr_url", "poster_url", "paystack_dashboard_url"] as const) {
    if (!isTrustedPaystackTerminalAssetUrl(body[key])) return key;
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const { id } = await params;
    const body = assetUpdateSchema.parse(await request.json());
    const badUrl = validateTrustedUrls(body);
    if (badUrl) {
      return errorResponse(
        `${badUrl} must be an HTTPS Paystack or trusted storage URL.`,
        "UNTRUSTED_TERMINAL_ASSET_URL",
        400,
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: terminal, error: terminalError } = await (supabase
      .from("provider_paystack_virtual_terminals") as any)
      .select("*, provider:providers(tenant_id)")
      .eq("id", id)
      .maybeSingle();
    if (terminalError) throw terminalError;
    if (!terminal) return errorResponse("Terminal not found", "NOT_FOUND", 404);

    const tenantId = (terminal as { provider?: { tenant_id?: string | null } | null }).provider?.tenant_id ?? null;
    const nextPaymentLink = body.payment_link ?? terminal.payment_link ?? terminal.terminal_url ?? null;
    const nextTerminalUrl = body.terminal_url ?? terminal.terminal_url ?? body.payment_link ?? null;
    const nextQrUrl = body.qr_url ?? terminal.qr_url ?? null;
    const nextPosterUrl = body.poster_url ?? terminal.poster_url ?? null;
    const assetStatus = computePaystackTerminalAssetStatus({
      payment_link: nextPaymentLink,
      terminal_url: nextTerminalUrl,
      qr_url: nextQrUrl,
      poster_url: nextPosterUrl,
    });

    if (body.paystack_name && body.paystack_name !== terminal.name) {
      await updatePaystackVirtualTerminal(terminal.terminal_code, { name: body.paystack_name }, { tenantId });
    }

    const patch: Record<string, unknown> = {
      payment_link: nextPaymentLink,
      terminal_url: nextTerminalUrl,
      qr_url: nextQrUrl,
      poster_url: nextPosterUrl,
      asset_status: assetStatus,
      asset_notes: body.asset_notes ?? terminal.asset_notes ?? null,
      poster_storage_path: body.poster_storage_path ?? terminal.poster_storage_path ?? null,
      display_name: body.display_name ?? terminal.display_name ?? terminal.name,
      name: body.paystack_name ?? terminal.name,
      paystack_dashboard_url: body.paystack_dashboard_url ?? terminal.paystack_dashboard_url ?? null,
      identity_status: body.identity_status ?? (body.display_name || body.paystack_name ? "manual_override" : terminal.identity_status),
    };

    if (assetStatus === "ready") {
      patch.asset_completed_at = terminal.asset_completed_at ?? new Date().toISOString();
      patch.asset_completed_by = terminal.asset_completed_by ?? user.id;
      patch.asset_request_status = "completed";
      patch.asset_request_completed_at = terminal.asset_request_completed_at ?? new Date().toISOString();
    } else {
      patch.asset_completed_at = null;
      patch.asset_completed_by = null;
      patch.asset_request_status =
        terminal.asset_request_status === "requested" || terminal.asset_request_status === "in_progress"
          ? "in_progress"
          : terminal.asset_request_status ?? "not_requested";
    }

    if (body.notification_whatsapp !== undefined) {
      const nextWhatsapp = normalizeWhatsAppTarget(body.notification_whatsapp);
      const previousWhatsapp = normalizeWhatsAppTarget(terminal.notification_whatsapp);
      if (previousWhatsapp && previousWhatsapp !== nextWhatsapp) {
        await unassignPaystackVirtualTerminalDestinations(terminal.terminal_code, [previousWhatsapp], { tenantId });
      }
      if (nextWhatsapp && nextWhatsapp !== previousWhatsapp) {
        await assignPaystackVirtualTerminalDestinations(
          terminal.terminal_code,
          [{ target: nextWhatsapp, name: body.notification_whatsapp_label ?? terminal.display_name ?? terminal.name }],
          { tenantId },
        );
      }
      patch.notification_whatsapp = nextWhatsapp;
      patch.notification_whatsapp_label = body.notification_whatsapp_label ?? terminal.notification_whatsapp_label ?? null;
      patch.destination_status = nextWhatsapp ? "configured" : "not_configured";
    }

    const { data, error } = await (supabase
      .from("provider_paystack_virtual_terminals") as any)
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update Paystack Terminal assets");
  }
}
