import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AgentPrincipal } from "@beautonomi/agent-policy";
import { runAdminGlobalSearch, type AdminSearchKind } from "@/lib/admin/global-search";
import {
  fetchFinanceLedgerRowsForTenant,
  normalizeAdminLedgerRange,
} from "@/lib/admin/finance-ledger-tenant";
import { aggregateFinanceLedgerRows } from "@/lib/admin/aggregate-finance-ledger-rows";
import { getActiveProviderPayoutHold } from "@/lib/fraud/provider-payout-hold";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";
import { canonicalizeProviderId } from "@/lib/agents/copilot/canonicalize-entity";

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}

export async function searchEntitiesForCopilot(
  principal: AgentPrincipal,
  input: { query: string; kinds?: AdminSearchKind[] },
) {
  const admin = getSupabaseAdmin();
  const results = await runAdminGlobalSearch(admin, principal.tenantId, input.query, input.kinds);
  const matches: Array<{ kind: string; id: string; label: string; subtitle?: string }> = [];
  for (const u of results.users.slice(0, 5)) {
    matches.push({
      kind: "user",
      id: u.id,
      label: u.full_name || u.email || u.id,
      subtitle: u.email ?? undefined,
    });
  }
  for (const p of results.providers.slice(0, 5)) {
    matches.push({
      kind: "provider",
      id: p.id,
      label: p.business_name || p.owner_name || p.id,
      subtitle: p.status ?? undefined,
    });
  }
  for (const b of results.bookings.slice(0, 5)) {
    matches.push({
      kind: "booking",
      id: b.id,
      label: b.booking_number || b.id,
      subtitle: b.status ?? undefined,
    });
  }
  return { matches: matches.slice(0, 15) };
}

export async function readBookingSummary(principal: AgentPrincipal, bookingId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, status, scheduled_at, completed_at, payment_status, total_amount, currency, customer_id, provider_id, tenant_id",
    )
    .eq("id", bookingId)
    .eq("tenant_id", principal.tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("booking_not_found");

  let provider_name: string | null = null;
  let customer_name: string | null = null;
  if (data.provider_id) {
    const { data: prov } = await supabase
      .from("providers")
      .select("business_name")
      .eq("id", data.provider_id)
      .maybeSingle();
    provider_name = (prov as { business_name?: string } | null)?.business_name ?? null;
  }
  if (data.customer_id) {
    const { data: cust } = await supabase.from("users").select("full_name").eq("id", data.customer_id).maybeSingle();
    customer_name = (cust as { full_name?: string } | null)?.full_name ?? null;
  }

  return {
    id: data.id,
    booking_number: data.booking_number,
    status: data.status,
    scheduled_at: data.scheduled_at,
    completed_at: data.completed_at,
    payment_status: data.payment_status,
    total_amount: data.total_amount,
    currency: data.currency,
    provider_id: data.provider_id,
    provider_name,
    customer_id: data.customer_id,
    customer_name,
  };
}

export async function readUserProfileSummary(principal: AgentPrincipal, userId: string) {
  const admin = getSupabaseAdmin();
  const userData = await getUserRowIfAccessibleToAdminTenant(admin, principal.tenantId, userId);
  if (!userData) throw new Error("user_not_found");

  const row = userData as Record<string, unknown>;
  const role = String(row.role ?? "");
  const stats: Record<string, unknown> = {};

  const { data: wallet } = await admin
    .from("user_wallets")
    .select("balance, currency")
    .eq("user_id", userId)
    .maybeSingle();

  if (role === "customer") {
    const { count: bookingCount } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", principal.tenantId)
      .eq("customer_id", userId);

    const { data: bookings } = await admin
      .from("bookings")
      .select("total_amount")
      .eq("tenant_id", principal.tenantId)
      .eq("customer_id", userId)
      .in("status", ["completed", "confirmed"]);

    const totalSpent = (bookings ?? []).reduce((sum, b) => sum + Number((b as { total_amount?: number }).total_amount ?? 0), 0);

    const { data: lastBooking } = await admin
      .from("bookings")
      .select("scheduled_at")
      .eq("tenant_id", principal.tenantId)
      .eq("customer_id", userId)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    stats.total_bookings = bookingCount ?? 0;
    stats.total_spent = totalSpent;
    stats.last_booking_date = (lastBooking as { scheduled_at?: string } | null)?.scheduled_at ?? null;
  }

  const { data: tickets } = await admin
    .from("support_tickets")
    .select("id, ticket_number, status, subject")
    .eq("user_id", userId)
    .in("status", ["open", "pending", "in_progress"])
    .limit(5);

  return {
    id: userId,
    full_name: row.full_name != null ? String(row.full_name) : null,
    email: maskEmail(row.email != null ? String(row.email) : null),
    phone: row.phone != null ? String(row.phone).replace(/\d(?=\d{4})/g, "*") : null,
    role,
    created_at: row.created_at != null ? String(row.created_at) : null,
    is_suspended: Boolean(row.is_suspended ?? row.account_suspended),
    stats,
    wallet: wallet
      ? { balance: Number((wallet as { balance?: number }).balance ?? 0), currency: (wallet as { currency?: string }).currency ?? "ZAR" }
      : null,
    open_tickets: (tickets ?? []).map((t) => ({
      ticket_number: (t as { ticket_number?: string }).ticket_number,
      status: (t as { status?: string }).status,
      subject: String((t as { subject?: string }).subject ?? "").slice(0, 80),
    })),
  };
}

export async function readUserRecentBookings(principal: AgentPrincipal, userId: string) {
  const admin = getSupabaseAdmin();
  const userData = await getUserRowIfAccessibleToAdminTenant(admin, principal.tenantId, userId);
  if (!userData) throw new Error("user_not_found");

  const { data: bookings } = await admin
    .from("bookings")
    .select("id, booking_number, status, scheduled_at, total_amount, currency, provider_id")
    .eq("tenant_id", principal.tenantId)
    .eq("customer_id", userId)
    .order("scheduled_at", { ascending: false })
    .limit(5);

  const provIds = [...new Set((bookings ?? []).map((b) => (b as { provider_id?: string }).provider_id).filter(Boolean))];
  const provMap = new Map<string, string>();
  if (provIds.length) {
    const { data: provs } = await admin.from("providers").select("id, business_name").in("id", provIds);
    for (const p of provs ?? []) provMap.set((p as { id: string }).id, (p as { business_name?: string }).business_name ?? "");
  }

  return {
    userId,
    bookings: (bookings ?? []).map((b) => {
      const row = b as {
        id: string;
        booking_number?: string;
        status?: string;
        scheduled_at?: string;
        total_amount?: number;
        currency?: string;
        provider_id?: string;
      };
      return {
        booking_number: row.booking_number,
        status: row.status,
        scheduled_at: row.scheduled_at,
        total_amount: row.total_amount,
        currency: row.currency,
        provider_name: row.provider_id ? provMap.get(row.provider_id) ?? null : null,
      };
    }),
  };
}

export async function readFinanceProviderSummary(
  principal: AgentPrincipal,
  input: { providerId: string; startDate?: string; endDate?: string },
) {
  const admin = getSupabaseAdmin();
  const { data: providerRow } = await admin
    .from("providers")
    .select("id")
    .eq("id", input.providerId)
    .eq("tenant_id", principal.tenantId)
    .maybeSingle();
  if (!providerRow) throw new Error("provider_not_found");

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rangeStart = input.startDate ?? monthStart.toISOString();
  const rangeEnd = input.endDate ?? now.toISOString();
  normalizeAdminLedgerRange({ start: rangeStart, end: rangeEnd });

  const rows = await fetchFinanceLedgerRowsForTenant(admin, principal.tenantId, {
    start: rangeStart,
    end: rangeEnd,
  }, { restrictProviderIds: [input.providerId] });

  const agg = aggregateFinanceLedgerRows(rows);

  let gross = 0;
  let fees = 0;
  let commission = 0;
  let net = 0;
  let refunds = 0;
  let payouts = 0;
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const txType = String(r.transaction_type ?? "");
    const amount = Number(r.amount ?? 0);
    const rowNet = Number(r.net ?? amount);
    if (
      txType === "payment" ||
      txType === "wallet_payment" ||
      txType === "provider_earnings" ||
      txType === "tip" ||
      txType === "charge"
    ) {
      gross += amount;
      fees += Number(r.fees ?? 0);
      commission += Number(r.commission ?? 0);
      net += rowNet;
    } else if (txType === "refund") refunds += Math.abs(rowNet);
    else if (txType === "payout") payouts += Math.abs(rowNet);
  }

  const hold = await getActiveProviderPayoutHold(admin, input.providerId);

  const { data: payoutRows } = await admin
    .from("payouts")
    .select("payout_number, status, amount, currency, created_at")
    .eq("tenant_id", principal.tenantId)
    .eq("provider_id", input.providerId)
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: subs } = await admin
    .from("provider_subscriptions")
    .select("status, billing_period, subscription_plans:plan_id(name)")
    .eq("provider_id", input.providerId)
    .order("created_at", { ascending: false })
    .limit(1);

  const subRaw = subs?.[0] as {
    status?: string;
    billing_period?: string;
    subscription_plans?: { name?: string } | Array<{ name?: string }> | null;
  } | undefined;
  const planRow = Array.isArray(subRaw?.subscription_plans)
    ? subRaw?.subscription_plans[0]
    : subRaw?.subscription_plans;

  return {
    providerId: input.providerId,
    period: { start: rangeStart, end: rangeEnd },
    currency: agg.currency,
    provider_earnings: agg.provider_earnings_net,
    provider_net_activity: agg.provider_earnings_net - agg.refunds_abs_gross,
    payouts_paid_total: agg.payouts_paid_total,
    refunds_gross: agg.refunds_gross,
    ledger_totals: { gross, fees, commission, net, refunds, payouts },
    active_payout_hold: hold
      ? {
          reason: hold.reason,
          fraud_case_id: hold.fraud_case_id,
          created_at: hold.created_at,
        }
      : null,
    recent_payouts: (payoutRows ?? []).map((p) => ({
      payout_number: (p as { payout_number?: string }).payout_number,
      status: (p as { status?: string }).status,
      amount: Number((p as { amount?: number }).amount ?? 0),
      currency: (p as { currency?: string }).currency,
      created_at: (p as { created_at?: string }).created_at,
    })),
    subscription: subRaw
      ? {
          plan_name: planRow?.name ?? null,
          status: subRaw.status,
          billing_period: subRaw.billing_period,
        }
      : null,
  };
}

export async function readProviderProfileSummary(principal: AgentPrincipal, providerId: string) {
  const canon = await canonicalizeProviderId(principal.tenantId, providerId);
  if (!canon) throw new Error("provider_not_found");
  const id = canon.id;
  const admin = getSupabaseAdmin();

  const { data: provider, error } = await admin
    .from("providers")
    .select("id, status, is_verified, is_featured, user_id, business_name")
    .eq("id", id)
    .eq("tenant_id", principal.tenantId)
    .maybeSingle();
  if (error || !provider) throw new Error("provider_not_found");

  const [{ count: locCount }, { count: offCount }, { data: reviews }] = await Promise.all([
    admin.from("provider_locations").select("id", { count: "exact", head: true }).eq("provider_id", id),
    admin.from("offerings").select("id", { count: "exact", head: true }).eq("provider_id", id),
    admin.from("reviews").select("rating").eq("provider_id", id),
  ]);

  const ratings = (reviews ?? []).map((r) => Number((r as { rating?: number }).rating ?? 0));
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

  let owner_name: string | null = null;
  let owner_email: string | null = null;
  const userId = (provider as { user_id?: string }).user_id;
  if (userId) {
    const { data: owner } = await admin.from("users").select("full_name, email").eq("id", userId).maybeSingle();
    owner_name = (owner as { full_name?: string } | null)?.full_name ?? null;
    owner_email = maskEmail((owner as { email?: string } | null)?.email ?? null);
  }

  const { data: yoco } = await admin
    .from("provider_yoco_integrations")
    .select("is_enabled, public_key, secret_key, credential_mode, environment")
    .eq("provider_id", id)
    .maybeSingle();
  const integ = yoco as {
    is_enabled?: boolean;
    public_key?: string | null;
    secret_key?: string | null;
    credential_mode?: string | null;
    environment?: string | null;
  } | null;

  const { data: bookingRows } = await admin
    .from("bookings")
    .select("booking_number, status, scheduled_at, total_amount, currency")
    .eq("tenant_id", principal.tenantId)
    .eq("provider_id", id)
    .order("scheduled_at", { ascending: false })
    .limit(5);

  return {
    providerId: id,
    business_name: (provider as { business_name?: string }).business_name ?? canon.label,
    status: String((provider as { status?: string }).status ?? "unknown"),
    is_verified: Boolean((provider as { is_verified?: boolean }).is_verified),
    is_featured: Boolean((provider as { is_featured?: boolean }).is_featured),
    stats: {
      location_count: locCount ?? 0,
      offering_count: offCount ?? 0,
      average_rating: Math.round(avgRating * 10) / 10,
      review_count: ratings.length,
    },
    owner: { full_name: owner_name, email: owner_email },
    yoco_summary: {
      enabled: Boolean(integ?.is_enabled),
      has_public_key: Boolean(integ?.public_key && String(integ.public_key).length > 0),
      has_secret_key: Boolean(integ?.secret_key && String(integ.secret_key).trim().length > 0),
      credential_mode: integ?.credential_mode ?? "none",
      environment: integ?.environment ?? "live",
    },
    recentBookings: (bookingRows ?? []).map((b) => ({
      booking_number: (b as { booking_number?: string }).booking_number,
      status: (b as { status?: string }).status,
      scheduled_at: (b as { scheduled_at?: string }).scheduled_at,
      total_amount: (b as { total_amount?: number }).total_amount,
      currency: (b as { currency?: string }).currency,
    })),
  };
}

export async function readProviderOnboardingProgress(principal: AgentPrincipal, providerId: string) {
  const admin = getSupabaseAdmin();
  const { data: provider } = await admin
    .from("providers")
    .select("user_id, business_name, status, is_verified")
    .eq("id", providerId)
    .eq("tenant_id", principal.tenantId)
    .maybeSingle();
  if (!provider) throw new Error("provider_not_found");
  const userId = (provider as { user_id?: string }).user_id;
  if (!userId) throw new Error("provider_no_owner");

  const { data: draft } = await admin
    .from("provider_onboarding_drafts")
    .select("current_step, draft_data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    providerId,
    userId,
    business_name: (provider as { business_name?: string }).business_name,
    status: (provider as { status?: string }).status,
    is_verified: Boolean((provider as { is_verified?: boolean }).is_verified),
    draft: draft
      ? {
          current_step: (draft as { current_step?: number }).current_step,
          updated_at: (draft as { updated_at?: string }).updated_at,
        }
      : null,
  };
}

export async function listOpenTicketsForProvider(principal: AgentPrincipal, providerId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("support_tickets")
    .select("id, ticket_number, status, priority, subject, created_at")
    .eq("provider_id", providerId)
    .in("status", ["open", "pending", "in_progress", "waiting_on_customer"])
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;

  return {
    providerId,
    tickets: (data ?? []).map((t) => ({
      ticket_number: (t as { ticket_number?: string }).ticket_number,
      status: (t as { status?: string }).status,
      priority: (t as { priority?: string }).priority,
      subject: String((t as { subject?: string }).subject ?? "").slice(0, 100),
      created_at: (t as { created_at?: string }).created_at,
    })),
  };
}

export async function readProviderRiskSummary(principal: AgentPrincipal, providerId: string) {
  const admin = getSupabaseAdmin();
  const { data: fraudCases } = await admin
    .from("fraud_cases")
    .select("id, status, risk_score")
    .eq("tenant_id", principal.tenantId)
    .eq("subject_provider_id", providerId)
    .not("status", "eq", "closed")
    .limit(10);

  const { data: bookings } = await admin
    .from("bookings")
    .select("id")
    .eq("tenant_id", principal.tenantId)
    .eq("provider_id", providerId)
    .limit(200);
  const bookingIds = (bookings ?? []).map((b) => (b as { id: string }).id);

  let disputes: Array<{ id: string; status: string | null }> = [];
  if (bookingIds.length) {
    const { data: disp } = await admin
      .from("disputes")
      .select("id, status")
      .in("booking_id", bookingIds)
      .limit(10);
    disputes = (disp ?? []).map((d) => ({
      id: (d as { id: string }).id,
      status: (d as { status?: string }).status ?? null,
    }));
  }

  return {
    providerId,
    open_fraud_cases: (fraudCases ?? []).map((f) => ({
      id: (f as { id: string }).id,
      status: (f as { status?: string }).status,
      risk_score: (f as { risk_score?: number }).risk_score ?? null,
    })),
    disputes,
  };
}

export async function readUserRiskSummary(principal: AgentPrincipal, userId: string) {
  const admin = getSupabaseAdmin();
  const userData = await getUserRowIfAccessibleToAdminTenant(admin, principal.tenantId, userId);
  if (!userData) throw new Error("user_not_found");

  const { data: fraudCases } = await admin
    .from("fraud_cases")
    .select("id, status, risk_score")
    .eq("tenant_id", principal.tenantId)
    .eq("subject_user_id", userId)
    .not("status", "eq", "closed")
    .limit(10);

  const { data: bookingRows } = await admin
    .from("bookings")
    .select("id")
    .eq("tenant_id", principal.tenantId)
    .eq("customer_id", userId);
  const bIds = (bookingRows ?? []).map((b) => (b as { id: string }).id);

  let matchedDisputes: Array<{ id: string; status: string | null }> = [];
  if (bIds.length) {
    const { data: disputes } = await admin
      .from("disputes")
      .select("id, status, booking_id")
      .in("booking_id", bIds)
      .limit(10);
    matchedDisputes = (disputes ?? []).map((d) => ({
      id: (d as { id: string }).id,
      status: (d as { status?: string }).status ?? null,
    }));
  }

  const { count: reportCount } = await admin
    .from("content_reports")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", principal.tenantId)
    .eq("author_user_id", userId);

  return {
    userId,
    open_fraud_cases: (fraudCases ?? []).map((f) => ({
      id: (f as { id: string }).id,
      status: (f as { status?: string }).status,
      risk_score: (f as { risk_score?: number }).risk_score ?? null,
    })),
    disputes: matchedDisputes,
    content_report_count: reportCount ?? 0,
  };
}
