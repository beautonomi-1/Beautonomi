import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  getProviderIdForUser,
  handleApiError,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { requirePaystackVirtualTerminalEnabledForProvider } from "@/lib/payments/paystack-virtual-terminal-feature-gate";
import { slackNotifyPaystackTerminalAssetRequested } from "@/lib/integrations/slack/ops-triggers";

const REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

async function resolveProvider(request: NextRequest) {
  const permissionCheck = await requirePermission("process_payments", request);
  if (!permissionCheck.authorized) {
    return { denied: permissionCheck.response! };
  }
  const { user } = permissionCheck;
  const supabase = await getSupabaseServer(request);
  const providerId = await getProviderIdForUser(user.id, supabase, { request });
  return { denied: undefined, supabase, user, providerId };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const resolved = await resolveProvider(request);
    if (resolved.denied) return resolved.denied;
    const { supabase, user, providerId } = resolved;
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const admin = getSupabaseAdmin();
    const { data: terminal, error: terminalError } = await (admin
      .from("provider_paystack_virtual_terminals") as any)
      .select("*, provider:providers(id, tenant_id, business_name)")
      .eq("id", id)
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .maybeSingle();
    if (terminalError) throw terminalError;
    if (!terminal) return errorResponse("Terminal not found", "NOT_FOUND", 404);

    if (terminal.asset_status === "ready") {
      return successResponse({
        terminal,
        requested: false,
        message: "Your Paystack Terminal QR and poster assets are already ready.",
      });
    }

    const lastRequestedAt = terminal.asset_last_requested_at
      ? new Date(terminal.asset_last_requested_at).getTime()
      : 0;
    const nowMs = Date.now();
    if (lastRequestedAt && nowMs - lastRequestedAt < REQUEST_COOLDOWN_MS) {
      return successResponse({
        terminal,
        requested: false,
        message: "Your branded QR/poster request is already in the Ops queue.",
      });
    }

    const now = new Date(nowMs).toISOString();
    const { data: updated, error: updateError } = await (admin
      .from("provider_paystack_virtual_terminals") as any)
      .update({
        asset_last_requested_at: now,
        asset_last_requested_by: user.id,
        asset_requested_by_provider_at: now,
        asset_request_status: "requested",
      })
      .eq("id", id)
      .eq("provider_id", providerId)
      .select("*, provider:providers(id, tenant_id, business_name)")
      .single();
    if (updateError) throw updateError;

    slackNotifyPaystackTerminalAssetRequested({
      tenantId: updated.provider?.tenant_id ?? null,
      terminalId: updated.id,
      terminalCode: updated.terminal_code,
      terminalName: updated.display_name ?? updated.name,
      providerName: updated.provider?.business_name ?? null,
      paymentLink: updated.payment_link ?? updated.terminal_url ?? null,
      requestedBy: (user as { email?: string | null }).email ?? user.id,
    });

    return successResponse({
      terminal: updated,
      requested: true,
      message: "Beautonomi Ops has been notified to prepare your branded QR and poster.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to request Paystack Terminal branded assets");
  }
}
