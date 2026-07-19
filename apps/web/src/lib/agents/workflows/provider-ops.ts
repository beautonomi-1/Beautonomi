/**
 * Provider operations agent — the "partner success team" work, scaled by
 * software. Per tenant it proposes:
 *
 *   1. HEALTH MONITOR (`provider.outreach`): active providers whose completed
 *      bookings dropped sharply vs the prior 30 days get a personal check-in
 *      message drafted for them.
 *   2. ONBOARDING SHEPHERD (`provider.outreach`): active providers blocked on
 *      the exact next step (no services, no payout account, no working hours)
 *      get a targeted nudge naming that step.
 *   3. CATALOG QUALITY (`catalog.review`): listings with empty/thin
 *      descriptions or price outliers get improvement suggestions the content
 *      admin can approve to send to the provider.
 *   4. WEEKLY DIGEST (`provider.digest`, separate entry point): a "your week"
 *      summary with one concrete suggestion, sent via the notification rail.
 *
 * Everything is proposal-only; approved outreach is delivered through seeded
 * notification templates (push + email), never raw sends.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadAgentDefinition, loadAgentModuleConfig, loadAgentOperationalState } from "../config-loader";
import { assertAgentReadAllowed } from "../safety-gate";
import { proposeAgentAction } from "../actions/action-service";
import { hashPayload } from "@beautonomi/agent-policy";

const PER_KIND_LIMIT = 10;

export type ProviderOpsCounts = {
  healthOutreach: number;
  onboardingNudges: number;
  catalogReviews: number;
  errors: string[];
};

function isDuplicate(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = String((err as { message?: string } | null)?.message ?? err ?? "");
  return code === "23505" || /duplicate|unique/i.test(message);
}

/** Pure + testable: decide whether a provider's booking trend warrants a check-in. */
export function isBookingTrendConcerning(params: { previous30d: number; recent30d: number }): boolean {
  if (params.previous30d < 5) return false; // too little history to call it a decline
  return params.recent30d <= params.previous30d * 0.5;
}

/** Pure + testable: the exact onboarding blocker, or null when none. */
export function detectOnboardingBlocker(params: {
  activeServiceCount: number;
  hasActivePayoutAccount: boolean;
  hasWorkingHours: boolean;
}): { blocker: string; message: string } | null {
  if (params.activeServiceCount === 0) {
    return {
      blocker: "no_services",
      message:
        "Your profile is live but you haven't listed any services yet — customers can't book you until you do. Add your first service in a few minutes from the app under Services → Add service.",
    };
  }
  if (!params.hasActivePayoutAccount) {
    return {
      blocker: "no_payout_account",
      message:
        "You're taking bookings but haven't added a payout account, so we can't pay out your earnings. Add your bank details under Finance → Payout accounts to get paid.",
    };
  }
  if (!params.hasWorkingHours) {
    return {
      blocker: "no_working_hours",
      message:
        "Your location has no working hours set, so customers see no availability. Set your hours under Locations → Working hours to start appearing in search.",
    };
  }
  return null;
}

/** Pure + testable: catalog quality issues for one listing. */
export function detectCatalogIssues(offering: {
  title: string;
  description: string | null;
  price: number;
  medianPrice: number | null;
}): string[] {
  const issues: string[] = [];
  const desc = (offering.description ?? "").trim();
  if (desc.length === 0) issues.push("Missing description — listings with descriptions convert significantly better.");
  else if (desc.length < 40) issues.push("Very short description — add what's included, duration and expected results.");
  if (offering.title.trim().length < 4) issues.push("Title too short to be searchable.");
  if (offering.medianPrice != null && offering.medianPrice > 0) {
    if (offering.price > offering.medianPrice * 4) {
      issues.push(`Price is more than 4× the category median (${offering.medianPrice.toFixed(0)}) — double-check it isn't a typo.`);
    }
    if (offering.price > 0 && offering.price < offering.medianPrice * 0.2) {
      issues.push(`Price is under 20% of the category median (${offering.medianPrice.toFixed(0)}) — double-check it isn't a typo.`);
    }
  }
  return issues;
}

async function countCompletedBookings(
  supabase: SupabaseClient,
  providerId: string,
  fromIso: string,
  toIso: string,
): Promise<number> {
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId)
    .in("status", ["completed", "confirmed", "in_progress"])
    .gte("scheduled_at", fromIso)
    .lt("scheduled_at", toIso);
  return count ?? 0;
}

export async function runProviderOpsSweepForTenant(params: {
  tenantId: string;
  environment?: string;
}): Promise<{ skipped: true; reason: string } | { counts: ProviderOpsCounts }> {
  const agentModule = await loadAgentModuleConfig(params.environment);
  const gate = assertAgentReadAllowed({ masterEnabled: agentModule.masterEnabled });
  if (!gate.allowed) return { skipped: true, reason: gate.reason ?? "gated" };

  const def = await loadAgentDefinition("ops-sentinel");
  if (!def) return { skipped: true, reason: "ops_sentinel_not_configured" };
  const op = await loadAgentOperationalState("ops-sentinel");
  if (op.state !== "active") return { skipped: true, reason: "agent_not_active" };

  const supabase = getSupabaseAdmin();
  const counts: ProviderOpsCounts = { healthOutreach: 0, onboardingNudges: 0, catalogReviews: 0, errors: [] };
  const now = Date.now();

  const proposeOutreach = async (input: {
    providerId: string;
    ownerUserId: string;
    subject: string;
    message: string;
    kind: string;
    reasoning: string;
    idempotencyKey: string;
    counterKey: "healthOutreach" | "onboardingNudges";
  }) => {
    try {
      await proposeAgentAction({
        tenantId: params.tenantId,
        agentId: def.id,
        actionType: "provider.outreach",
        targetType: "provider",
        targetId: input.providerId,
        proposedPayload: {
          providerId: input.providerId,
          ownerUserId: input.ownerUserId,
          subject: input.subject,
          message: input.message,
          outreachKind: input.kind,
        },
        reasoningSummary: input.reasoning,
        riskLevel: 1,
        policyVersion: def.active_version,
        idempotencyKey: input.idempotencyKey,
      });
      counts[input.counterKey] += 1;
    } catch (err) {
      if (!isDuplicate(err)) counts.errors.push(`${input.kind}:${input.providerId}:${String(err).slice(0, 120)}`);
    }
  };

  const { data: providers } = await supabase
    .from("providers")
    .select("id, user_id, business_name, status, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(200);

  // ── 1 + 2. Health monitor & onboarding shepherd ─────────────────────────
  let healthChecked = 0;
  for (const p of providers ?? []) {
    if (counts.healthOutreach >= PER_KIND_LIMIT && counts.onboardingNudges >= PER_KIND_LIMIT) break;

    try {
      const { count: activeServices } = await supabase
        .from("offerings")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", p.id)
        .eq("is_active", true);
      const { data: payoutAccounts } = await supabase
        .from("provider_payout_accounts")
        .select("id")
        .eq("provider_id", p.id)
        .eq("active", true)
        .is("deleted_at", null)
        .limit(1);
      const { data: locations } = await supabase
        .from("provider_locations")
        .select("working_hours")
        .eq("provider_id", p.id)
        .eq("is_active", true)
        .limit(5);
      const hasWorkingHours = (locations ?? []).some(
        (l) => l.working_hours && Object.keys(l.working_hours as object).length > 0,
      );

      const blocker = detectOnboardingBlocker({
        activeServiceCount: activeServices ?? 0,
        hasActivePayoutAccount: (payoutAccounts ?? []).length > 0,
        hasWorkingHours: hasWorkingHours || (locations ?? []).length === 0,
      });

      if (blocker && counts.onboardingNudges < PER_KIND_LIMIT) {
        await proposeOutreach({
          providerId: p.id,
          ownerUserId: String(p.user_id),
          subject: "One step left to get fully set up",
          message: `Hi ${p.business_name}, ${blocker.message}`,
          kind: "onboarding_nudge",
          reasoning: `Provider is active but blocked on: ${blocker.blocker}. Approve to send the setup nudge.`,
          idempotencyKey: `provider-onboarding:${p.id}:${blocker.blocker}`,
          counterKey: "onboardingNudges",
        });
        continue; // one message per provider per sweep
      }

      // Health trend — cap the number of providers we deep-check per sweep.
      if (!blocker && counts.healthOutreach < PER_KIND_LIMIT && healthChecked < 50) {
        healthChecked += 1;
        const d30 = new Date(now - 30 * 24 * 3600_000).toISOString();
        const d60 = new Date(now - 60 * 24 * 3600_000).toISOString();
        const nowIso = new Date(now).toISOString();
        const recent30d = await countCompletedBookings(supabase, p.id, d30, nowIso);
        const previous30d = await countCompletedBookings(supabase, p.id, d60, d30);

        if (isBookingTrendConcerning({ previous30d, recent30d })) {
          await proposeOutreach({
            providerId: p.id,
            ownerUserId: String(p.user_id),
            subject: "We noticed your bookings dipped — can we help?",
            message: `Hi ${p.business_name}, your bookings went from ${previous30d} to ${recent30d} over the last month. Often a small change helps — updated photos, refreshed availability, or a promotion. Reply to this message or contact support and we'll help you get back on track.`,
            kind: "health_checkin",
            reasoning: `Completed bookings fell from ${previous30d} to ${recent30d} month-over-month. Approve to send a supportive check-in.`,
            idempotencyKey: `provider-health:${p.id}:${new Date(now).toISOString().slice(0, 7)}`,
            counterKey: "healthOutreach",
          });
        }
      }
    } catch (err) {
      counts.errors.push(`provider:${p.id}:${String(err).slice(0, 120)}`);
    }
  }

  // ── 3. Catalog quality ───────────────────────────────────────────────────
  try {
    const providerIds = (providers ?? []).map((p) => p.id);
    if (providerIds.length > 0) {
      const { data: offerings } = await supabase
        .from("offerings")
        .select("id, provider_id, title, description, price, category_id, updated_at")
        .in("provider_id", providerIds.slice(0, 100))
        .eq("is_active", true)
        .gte("updated_at", new Date(now - 14 * 24 * 3600_000).toISOString())
        .order("updated_at", { ascending: false })
        .limit(100);

      // Median price per category from this sample (good enough for outlier flags).
      const byCategory = new Map<string, number[]>();
      for (const o of offerings ?? []) {
        const key = String(o.category_id ?? "uncategorised");
        byCategory.set(key, [...(byCategory.get(key) ?? []), Number(o.price ?? 0)]);
      }
      const medianOf = (values: number[]): number | null => {
        if (values.length < 5) return null;
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
      };

      for (const o of offerings ?? []) {
        if (counts.catalogReviews >= PER_KIND_LIMIT) break;
        const issues = detectCatalogIssues({
          title: String(o.title ?? ""),
          description: o.description as string | null,
          price: Number(o.price ?? 0),
          medianPrice: medianOf(byCategory.get(String(o.category_id ?? "uncategorised")) ?? []),
        });
        if (issues.length === 0) continue;

        const owner = (providers ?? []).find((p) => p.id === o.provider_id);
        if (!owner) continue;
        try {
          const payload = {
            offeringId: o.id,
            providerId: o.provider_id,
            ownerUserId: String(owner.user_id),
            listingTitle: o.title,
            issues,
            subject: `Quick wins for your listing "${String(o.title).slice(0, 60)}"`,
            message: `Hi ${owner.business_name}, a few quick improvements could help "${o.title}" get more bookings:\n\n${issues.map((i) => `• ${i}`).join("\n")}\n\nYou can edit the listing in the app under Services.`,
          };
          await proposeAgentAction({
            tenantId: params.tenantId,
            agentId: def.id,
            actionType: "catalog.review",
            targetType: "offering",
            targetId: String(o.id),
            proposedPayload: payload,
            reasoningSummary: `Listing "${String(o.title).slice(0, 60)}" has ${issues.length} quality issue(s). Approve to send improvement tips to the provider.`,
            riskLevel: 1,
            policyVersion: def.active_version,
            idempotencyKey: `catalog-review:${o.id}:${hashPayload(issues).slice(0, 12)}`,
          });
          counts.catalogReviews += 1;
        } catch (err) {
          if (!isDuplicate(err)) counts.errors.push(`catalog:${o.id}:${String(err).slice(0, 120)}`);
        }
      }
    }
  } catch (err) {
    counts.errors.push(`catalog-sweep:${String(err).slice(0, 120)}`);
  }

  return { counts };
}

/** ISO week key like 2026-W29 — keeps digests idempotent per provider per week. */
export function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Weekly "your week" digest proposals — run from the weekly cron. */
export async function runProviderDigestSweepForTenant(params: {
  tenantId: string;
  environment?: string;
}): Promise<{ skipped: true; reason: string } | { digests: number; errors: string[] }> {
  const agentModule = await loadAgentModuleConfig(params.environment);
  const gate = assertAgentReadAllowed({ masterEnabled: agentModule.masterEnabled });
  if (!gate.allowed) return { skipped: true, reason: gate.reason ?? "gated" };

  const def = await loadAgentDefinition("ops-sentinel");
  if (!def) return { skipped: true, reason: "ops_sentinel_not_configured" };
  const op = await loadAgentOperationalState("ops-sentinel");
  if (op.state !== "active") return { skipped: true, reason: "agent_not_active" };

  const supabase = getSupabaseAdmin();
  let digests = 0;
  const errors: string[] = [];
  const weekKey = isoWeekKey();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  const { data: providers } = await supabase
    .from("providers")
    .select("id, user_id, business_name, rating_average, currency")
    .eq("tenant_id", params.tenantId)
    .eq("status", "active")
    .limit(200);

  for (const p of providers ?? []) {
    if (digests >= 50) break;
    try {
      const { data: weekBookings } = await supabase
        .from("bookings")
        .select("id, status, total_amount")
        .eq("provider_id", p.id)
        .gte("created_at", weekAgo)
        .limit(200);
      const bookings = weekBookings ?? [];
      if (bookings.length === 0) continue; // no digest for a silent week

      const completed = bookings.filter((b) => b.status === "completed");
      const cancelled = bookings.filter((b) => b.status === "cancelled");
      const revenue = completed.reduce((sum, b) => sum + Number(b.total_amount ?? 0), 0);
      const { count: newReviews } = await supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", p.id)
        .gte("created_at", weekAgo);

      const suggestion =
        cancelled.length > completed.length
          ? "Cancellations outpaced completions this week — a reminder message or a deposit requirement can reduce no-shows."
          : (newReviews ?? 0) === 0 && completed.length > 0
            ? "You completed bookings but got no reviews — asking happy clients right after the appointment works best."
            : "Keep your calendar availability updated to stay high in search results.";

      const payload = {
        providerId: p.id,
        ownerUserId: String(p.user_id),
        week: weekKey,
        stats: {
          bookings: bookings.length,
          completed: completed.length,
          cancelled: cancelled.length,
          revenue: Math.round(revenue * 100) / 100,
          currency: p.currency ?? "ZAR",
          newReviews: newReviews ?? 0,
          rating: Number(p.rating_average ?? 0),
        },
        suggestion,
      };

      await proposeAgentAction({
        tenantId: params.tenantId,
        agentId: def.id,
        actionType: "provider.digest",
        targetType: "provider",
        targetId: p.id,
        proposedPayload: payload,
        reasoningSummary: `Weekly digest for ${p.business_name} (${bookings.length} bookings, ${payload.stats.revenue} ${payload.stats.currency}). Approve to send.`,
        riskLevel: 0,
        policyVersion: def.active_version,
        idempotencyKey: `provider-digest:${p.id}:${weekKey}`,
      });
      digests += 1;
    } catch (err) {
      if (!isDuplicate(err)) errors.push(`digest:${p.id}:${String(err).slice(0, 120)}`);
    }
  }

  return { digests, errors };
}
