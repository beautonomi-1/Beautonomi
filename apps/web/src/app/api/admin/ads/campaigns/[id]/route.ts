import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  forbiddenResponse,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { requireSuperadminPlatform } from "@/lib/admin/require-superadmin-platform";
import { writeAuditLog } from "@/lib/audit/audit";

const patchSchema = z.object({
  status: z.enum(["paused", "ended", "active"]),
  reason: z.string().max(500).optional(),
});

/**
 * GET /api/admin/ads/campaigns/[id]
 * Superadmin-only. Full campaign detail with event stats.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperadminPlatform(request);
    if (!auth.user) return forbiddenResponse("Superadmin only");

    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: campaign, error } = await admin
      .from("ads_campaigns")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!campaign) return notFoundResponse("Campaign not found");

    const c = campaign as Record<string, unknown>;

    const { data: providerRaw } = await admin
      .from("providers")
      .select(
        "id, business_name, email, phone, slug, avatar_url, user_id, users:user_id(full_name)"
      )
      .eq("id", c.provider_id as string)
      .maybeSingle();

    // Flatten owner display name from the linked users row so existing callers that read
    // `provider.owner_name` keep working without a column that does not exist.
    const provider = (() => {
      if (!providerRaw) return null;
      const raw = providerRaw as Record<string, unknown> & {
        users?:
          | { full_name?: string | null }
          | Array<{ full_name?: string | null }>
          | null;
      };
      const userRow = Array.isArray(raw.users) ? raw.users[0] : raw.users;
      return {
        ...raw,
        owner_name: userRow?.full_name ?? null,
      };
    })();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

    const { data: events } = await admin
      .from("ads_events")
      .select("event_type")
      .eq("campaign_id", id)
      .gte("created_at", thirtyDaysAgo);

    const eventCounts = { impressions: 0, clicks: 0, books: 0 };
    for (const e of (events ?? []) as { event_type: string }[]) {
      if (e.event_type === "impression") eventCounts.impressions++;
      else if (e.event_type === "click") eventCounts.clicks++;
      else if (e.event_type === "book") eventCounts.books++;
    }

    /**
     * §Release-audit 2026-04: previously selected `payment_status`, but the
     * `ads_budget_orders` schema (migration 262) defines the column as
     * `status` with values `pending|paid|failed|refunded`. The mismatch
     * meant Postgres would error and the entire admin campaign detail
     * payload could fail or silently return without budget orders. We
     * select `status` and alias it to `payment_status` to keep the existing
     * UI contract intact.
     */
    const { data: budgetOrdersRaw } = await admin
      .from("ads_budget_orders")
      .select("id, amount, currency, status, paystack_reference, paid_at, created_at")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    const budgetOrders = (budgetOrdersRaw ?? []).map((o) => ({
      id: (o as { id?: string }).id,
      amount: (o as { amount?: number }).amount,
      currency: (o as { currency?: string }).currency,
      status: (o as { status?: string }).status,
      payment_status: (o as { status?: string }).status,
      paystack_reference: (o as { paystack_reference?: string }).paystack_reference,
      paid_at: (o as { paid_at?: string | null }).paid_at,
      created_at: (o as { created_at?: string }).created_at,
    }));

    return successResponse({
      ...c,
      provider: provider ?? null,
      events_30d: eventCounts,
      budget_orders: budgetOrders,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch campaign");
  }
}

/**
 * PATCH /api/admin/ads/campaigns/[id]
 * Superadmin-only. Force-pause or end a provider campaign (trust & safety / billing oversight).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperadminPlatform(request);
    if (!auth.user) return forbiddenResponse("Superadmin only");

    const { id } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid input", "VALIDATION_ERROR", 400, parsed.error.issues);
    }
    const { status, reason } = parsed.data;

    const admin = getSupabaseAdmin();
    const { data: existing, error: fetchErr } = await admin
      .from("ads_campaigns")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) {
      return notFoundResponse("Campaign not found");
    }

    const prev = String((existing as { status: string }).status);
    if (prev === "ended" && status !== "active") {
      return errorResponse("Campaign is already ended", "INVALID_STATE", 400);
    }
    if (status === "paused" && prev === "paused") {
      return errorResponse("Campaign is already paused", "INVALID_STATE", 400);
    }
    if (status === "active" && prev === "ended") {
      return errorResponse("Cannot resume an ended campaign. Ask the provider to create a new one.", "INVALID_STATE", 400);
    }
    if (status === "active" && prev !== "paused" && prev !== "draft") {
      return errorResponse(`Cannot set status to active from ${prev}`, "INVALID_STATE", 400);
    }

    const { data: updated, error: updErr } = await admin
      .from("ads_campaigns")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updErr || !updated) {
      return handleApiError(updErr ?? new Error("Update failed"), "Failed to update campaign");
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: auth.user.role ?? "superadmin",
      action: "admin.ads.campaign.moderate",
      entity_type: "ads_campaign",
      entity_id: id,
      metadata: { previous_status: prev, new_status: status, reason: reason ?? null },
    });

    return successResponse({ campaign: updated });
  } catch (error) {
    return handleApiError(error as Error, "Failed to moderate ads campaign");
  }
}
