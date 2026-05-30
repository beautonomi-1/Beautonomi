import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  getOffsetPaginationParams,
  handleApiError,
  requireAdminSection,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { listPaystackVirtualTerminals } from "@/lib/payments/paystack-virtual-terminal";
import {
  buildPaystackTerminalName,
  computePaystackTerminalAssetStatus,
  isTrustedPaystackTerminalAssetUrl,
  normalizeWhatsAppTarget,
  scorePaystackTerminalProviderMatch,
} from "@/lib/payments/paystack-terminal-assets";

const importTerminalSchema = z.object({
  action: z.literal("import"),
  terminal_code: z.string().trim().min(1),
  provider_id: z.string().uuid(),
  location_id: z.string().uuid().optional().nullable(),
  display_name: z.string().trim().optional(),
  payment_link: z.string().trim().url().optional().nullable(),
  terminal_url: z.string().trim().url().optional().nullable(),
  qr_url: z.string().trim().url().optional().nullable(),
  poster_url: z.string().trim().url().optional().nullable(),
});

const syncSchema = z.object({
  action: z.literal("sync"),
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().trim().optional(),
});

function terminalHasLink(row: any) {
  return Boolean(row.payment_link || row.terminal_url);
}

function terminalHasPoster(row: any) {
  return Boolean(row.poster_url || row.qr_url);
}

function buildSummary(rows: any[]) {
  return rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.active) acc.active += 1;
      if (!terminalHasLink(row)) acc.missingPaymentLink += 1;
      if (!row.poster_url) acc.missingPoster += 1;
      if (!row.qr_url) acc.missingQr += 1;
      if (row.destination_status !== "configured") acc.missingWhatsappDestination += 1;
      if (row.identity_status === "needs_review") acc.needsIdentityReview += 1;
      if (row.asset_request_status === "requested" || row.asset_request_status === "in_progress") acc.requested += 1;
      if (row.asset_status === "ready") acc.ready += 1;
      return acc;
    },
    {
      total: 0,
      active: 0,
      missingPaymentLink: 0,
      missingPoster: 0,
      missingQr: 0,
      missingWhatsappDestination: 0,
      needsIdentityReview: 0,
      requested: 0,
      ready: 0,
    },
  );
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 50, maxLimit: 200 });
    const status = searchParams.get("status");
    const providerId = searchParams.get("provider_id");
    const assetStatus = searchParams.get("asset_status");
    const missingAssets = searchParams.get("missing_assets") === "true";
    const needsIdentityReview = searchParams.get("needs_identity_review") === "true";
    const missingDestination = searchParams.get("missing_destination") === "true";
    const requestedAssets = searchParams.get("requested_assets") === "true";
    const search = searchParams.get("search")?.trim();

    let query = (supabase.from("provider_paystack_virtual_terminals") as any)
      .select(
        `
          *,
          provider:providers(id, business_name, tenant_id, phone, billing_phone)
        `,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (providerId) query = query.eq("provider_id", providerId);
    if (assetStatus) query = query.eq("asset_status", assetStatus);
    if (needsIdentityReview) query = query.eq("identity_status", "needs_review");
    if (missingDestination) query = query.neq("destination_status", "configured");
    if (missingAssets) query = query.or("asset_status.neq.ready,asset_status.is.null");
    if (requestedAssets) query = query.in("asset_request_status", ["requested", "in_progress"]);
    if (requestedAssets) query = query.order("asset_last_requested_at", { ascending: false, nullsFirst: false });
    if (search) {
      const safe = search.replace(/[%_]/g, "");
      query = query.or(
        [
          `name.ilike.%${safe}%`,
          `display_name.ilike.%${safe}%`,
          `terminal_code.ilike.%${safe}%`,
          `notification_whatsapp.ilike.%${safe}%`,
        ].join(","),
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;
    const rows = data ?? [];

    return successResponse({
      items: rows,
      total: count ?? 0,
      limit,
      offset,
      hasMore: (count ?? 0) > offset + limit,
      summary: buildSummary(rows),
    });
  } catch (error) {
    return handleApiError(error, "Failed to load Paystack Terminal registry");
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const body = await request.json();
    if (body?.action === "sync") {
      const parsed = syncSchema.parse(body);
      const remote = await listPaystackVirtualTerminals({
        status: parsed.status,
        search: parsed.search,
        perPage: 100,
      });
      const terminals = remote.data ?? [];
      const codes = terminals.map((terminal) => terminal.code).filter(Boolean);
      const { data: localRows } = codes.length
        ? await (supabase
            .from("provider_paystack_virtual_terminals") as any)
            .select("id, terminal_code, provider_id")
            .in("terminal_code", codes)
        : { data: [] };
      const localByCode = new Map((localRows ?? []).map((row: any) => [row.terminal_code, row]));

      const { data: providers } = await supabase
        .from("providers")
        .select("id, business_name, phone, billing_phone, tenant_id")
        .limit(1000);
      const suggestions = terminals.map((terminal) => {
        const local = localByCode.get(terminal.code) as { id?: string; terminal_code?: string } | undefined;
        const scored = (providers ?? [])
          .map((provider: any) => ({
            provider,
            ...scorePaystackTerminalProviderMatch({
              terminalName: terminal.name,
              terminalCode: terminal.code,
              metadata: terminal.metadata ?? null,
              destinations: terminal.destinations ?? [],
              provider,
              localTerminalCode: local?.terminal_code ?? null,
            }),
          }))
          .filter((candidate) => candidate.confidence > 0)
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 3);
        return {
          ...terminal,
          mapped: Boolean(local),
          local_terminal_id: local?.id ?? null,
          suggested_matches: scored,
        };
      });
      return successResponse({
        items: suggestions,
        total: suggestions.length,
        unmapped: suggestions.filter((item) => !item.mapped).length,
      });
    }

    const parsed = importTerminalSchema.parse(body);
    if (!parsed.payment_link && !parsed.terminal_url) {
      return errorResponse(
        "Import the Paystack-hosted payment page URL from the Paystack dashboard before assigning this terminal to a provider.",
        "PAYMENT_LINK_REQUIRED",
        400,
      );
    }
    for (const key of ["payment_link", "terminal_url", "qr_url", "poster_url"] as const) {
      if (!isTrustedPaystackTerminalAssetUrl(parsed[key])) {
        return errorResponse(`${key} must be an HTTPS Paystack or trusted storage URL.`, "UNTRUSTED_TERMINAL_ASSET_URL", 400);
      }
    }
    const remote = await listPaystackVirtualTerminals({ search: parsed.terminal_code, perPage: 100 });
    const terminal = (remote.data ?? []).find((item) => item.code === parsed.terminal_code);
    if (!terminal) return errorResponse("Paystack terminal not found for this integration.", "NOT_FOUND", 404);
    const { data: provider } = await supabase
      .from("providers")
      .select("id, business_name, phone, billing_phone, tenant_id")
      .eq("id", parsed.provider_id)
      .maybeSingle();
    if (!provider) return errorResponse("Provider not found.", "PROVIDER_NOT_FOUND", 404);
    const { data: location } = parsed.location_id
      ? await supabase
          .from("provider_locations")
          .select("id, name, city")
          .eq("id", parsed.location_id)
          .eq("provider_id", parsed.provider_id)
          .maybeSingle()
      : { data: null };
    const displayName = parsed.display_name ?? terminal.name;
    const terminalName = buildPaystackTerminalName({
      providerBusinessName: (provider as any).business_name,
      locationName: (location as any)?.name ?? null,
      requestedName: displayName,
      uniqueSuffix: parsed.provider_id,
      portable: !parsed.location_id,
    });
    const destination = terminal.destinations?.[0]?.target
      ? normalizeWhatsAppTarget(terminal.destinations[0].target)
      : null;
    const assetStatus = computePaystackTerminalAssetStatus(parsed);
    const { data, error } = await (supabase
      .from("provider_paystack_virtual_terminals") as any)
      .insert({
        provider_id: parsed.provider_id,
        location_id: parsed.location_id ?? null,
        paystack_terminal_id: terminal.id,
        terminal_code: terminal.code,
        name: terminalName,
        display_name: displayName,
        status: terminal.active === false ? "inactive" : "active",
        active: terminal.active !== false,
        currency: terminal.currency ?? "ZAR",
        destinations: terminal.destinations ?? [],
        metadata: terminal.metadata ?? {},
        paystack_domain: terminal.domain ?? null,
        payment_link: parsed.payment_link ?? parsed.terminal_url ?? null,
        terminal_url: parsed.terminal_url ?? parsed.payment_link ?? null,
        qr_url: parsed.qr_url ?? null,
        poster_url: parsed.poster_url ?? null,
        notification_whatsapp: destination,
        notification_whatsapp_label: destination ? "Paystack dashboard destination" : null,
        destination_status: destination ? "configured" : "not_configured",
        asset_status: assetStatus,
        asset_completed_at: assetStatus === "ready" ? new Date().toISOString() : null,
        identity_status: "manual_override",
        synced_from_paystack_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return successResponse(data, 201);
  } catch (error) {
    return handleApiError(error, "Failed to sync Paystack Terminal registry");
  }
}
