import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SLACK_EVENT_KEYS, type SlackEventKey } from "@/lib/integrations/slack/event-keys";
import { tryNotifySlackEvent } from "@/lib/integrations/slack/dispatch";
import { getNegativeBalanceProvidersForTenant } from "@/lib/admin/negative-provider-payout-balances";

export type SlackOperationalAlertSummary = {
  tenants_processed: number;
  attempted: number;
  by_event: Record<string, number>;
  unsupported: string[];
};

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const CLOSED_TICKET_STATUSES = ["resolved", "closed"];
const CLOSED_LEAD_STAGES = ["won", "lost", "matched"];

function eventEnv(): "production" | "staging" | "development" {
  const e = process.env.BEAUTONOMI_SLACK_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV;
  if (e === "development") return "development";
  if (e === "preview" || e === "staging") return "staging";
  return "production";
}

function isoBefore(now: Date, ms: number): string {
  return new Date(now.getTime() - ms).toISOString();
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function ageLabel(value?: string | null, now = new Date()): string {
  if (!value) return "unknown age";
  const diff = Math.max(0, now.getTime() - new Date(value).getTime());
  const hours = Math.round(diff / HOUR);
  if (hours < 48) return `${hours}h old`;
  return `${Math.round(hours / 24)}d old`;
}

async function emit(
  summary: SlackOperationalAlertSummary,
  params: Parameters<typeof tryNotifySlackEvent>[0]
) {
  summary.attempted += 1;
  summary.by_event[params.eventKey] = (summary.by_event[params.eventKey] ?? 0) + 1;
  await tryNotifySlackEvent(params);
}

async function fetchActiveTenantIds(supabase: SupabaseAdmin): Promise<string[]> {
  const { data, error } = await supabase.from("tenants").select("id").eq("is_active", true);
  if (error) throw error;
  return (data ?? []).map((t: { id: string }) => t.id).filter(Boolean);
}

export async function runSlackOperationalAlerts(now = new Date()): Promise<SlackOperationalAlertSummary> {
  const supabase = getSupabaseAdmin();
  const tenantIds = await fetchActiveTenantIds(supabase);
  const summary: SlackOperationalAlertSummary = {
    tenants_processed: 0,
    attempted: 0,
    by_event: {},
    unsupported: [
      "support.ticket.overdue_followup uses updated_at age because no explicit next_follow_up_at field exists.",
      "support scheduled checks only include tickets linked to tenant-scoped providers; unscoped customer tickets still rely on direct event triggers.",
      "provider_ops.lead.high_value_created is not emitted because provider_leads has no reliable monetary value field.",
      "finance anomaly alerts are limited to real reconciliation, payout, refund, wallet, and negative-balance signals.",
    ],
  };

  for (const tenantId of tenantIds) {
    summary.tenants_processed += 1;
    await runSupportAlerts(supabase, tenantId, now, summary);
    await runLeadAlerts(supabase, tenantId, now, summary);
    await runFinanceAlerts(supabase, tenantId, now, summary);
    await runDisputeAlerts(supabase, tenantId, now, summary);
    await runSafetyAlerts(supabase, tenantId, now, summary);
    await runVerificationAlerts(supabase, tenantId, now, summary);
    await runTerminalMerchantOnboardingAlerts(supabase, tenantId, now, summary);
    await runDailyDigests(supabase, tenantId, now, summary);
  }

  return summary;
}

async function runSupportAlerts(
  supabase: SupabaseAdmin,
  tenantId: string,
  now: Date,
  summary: SlackOperationalAlertSummary
) {
  type Ticket = {
    id: string;
    ticket_number?: string | null;
    subject?: string | null;
    priority?: string | null;
    status?: string | null;
    assigned_to?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    sla_resolution_due_at?: string | null;
  };

  const baseSelect =
    "id, ticket_number, subject, priority, status, assigned_to, created_at, updated_at, sla_resolution_due_at, provider:providers!inner(tenant_id)";
  const highUnassignedCutoff = isoBefore(now, 30 * 60 * 1000);
  const { data: unassigned } = await supabase
    .from("support_tickets")
    .select(baseSelect)
    .eq("provider.tenant_id", tenantId)
    .in("priority", ["high", "urgent"])
    .is("assigned_to", null)
    .lt("created_at", highUnassignedCutoff)
    .not("status", "in", `(${CLOSED_TICKET_STATUSES.join(",")})`)
    .order("created_at", { ascending: true })
    .limit(10);

  for (const ticket of (unassigned ?? []) as Ticket[]) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.SUPPORT_TICKET_HIGH_UNASSIGNED,
      dedupeKey: `ticket:${ticket.id}:high-unassigned:${dayKey(now)}`,
      entityType: "support_ticket",
      entityId: ticket.id,
      title: `Unassigned ${ticket.priority} support ticket`,
      detailLines: [
        ticket.ticket_number || ticket.id,
        ticket.subject || "(no subject)",
        `Age: ${ageLabel(ticket.created_at, now)}`,
        "Action: assign an owner",
      ],
      actionUrl: `/support-tickets/${ticket.id}`,
    });
  }

  const { data: overdue } = await supabase
    .from("support_tickets")
    .select(baseSelect)
    .eq("provider.tenant_id", tenantId)
    .lt("sla_resolution_due_at", now.toISOString())
    .not("status", "in", `(${CLOSED_TICKET_STATUSES.join(",")})`)
    .order("sla_resolution_due_at", { ascending: true })
    .limit(10);

  for (const ticket of (overdue ?? []) as Ticket[]) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.SUPPORT_TICKET_OVERDUE,
      dedupeKey: `ticket:${ticket.id}:sla-overdue:${dayKey(now)}`,
      entityType: "support_ticket",
      entityId: ticket.id,
      title: "Support SLA breached",
      detailLines: [
        ticket.ticket_number || ticket.id,
        `Priority: ${ticket.priority || "unknown"}`,
        `Due: ${ticket.sla_resolution_due_at}`,
        "Action: resolve or escalate",
      ],
      actionUrl: `/support-tickets/${ticket.id}`,
    });
  }

  const { data: stale } = await supabase
    .from("support_tickets")
    .select(baseSelect)
    .eq("provider.tenant_id", tenantId)
    .lt("updated_at", isoBefore(now, 24 * HOUR))
    .not("status", "in", `(${CLOSED_TICKET_STATUSES.join(",")})`)
    .order("updated_at", { ascending: true })
    .limit(10);

  for (const ticket of (stale ?? []) as Ticket[]) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.SUPPORT_TICKET_FOLLOWUP_OVERDUE,
      dedupeKey: `ticket:${ticket.id}:followup:${dayKey(now)}`,
      entityType: "support_ticket",
      entityId: ticket.id,
      title: "Support ticket needs follow-up",
      detailLines: [
        ticket.ticket_number || ticket.id,
        ticket.subject || "(no subject)",
        `Last update: ${ageLabel(ticket.updated_at, now)}`,
      ],
      actionUrl: `/support-tickets/${ticket.id}`,
    });
  }

  const { count: openCount } = await supabase
    .from("support_tickets")
    .select("id, provider:providers!inner(tenant_id)", { count: "exact", head: true })
    .eq("provider.tenant_id", tenantId)
    .not("status", "in", `(${CLOSED_TICKET_STATUSES.join(",")})`);

  if ((openCount ?? 0) >= 20 || (overdue?.length ?? 0) >= 5) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.SUPPORT_QUEUE_HEALTH,
      dedupeKey: `support:queue-health:${dayKey(now)}`,
      entityType: "support_queue",
      entityId: tenantId,
      title: "Support queue health threshold crossed",
      detailLines: [`Open tickets: ${openCount ?? 0}`, `SLA breached in sample: ${overdue?.length ?? 0}`, "Action: rebalance ownership"],
      actionUrl: "/support-tickets",
    });
  }
}

async function runLeadAlerts(
  supabase: SupabaseAdmin,
  tenantId: string,
  now: Date,
  summary: SlackOperationalAlertSummary
) {
  type Lead = {
    id: string;
    business_name?: string | null;
    commercial_stage?: string | null;
    assigned_to?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
  };

  const select = "id, business_name, commercial_stage, assigned_to, updated_at, created_at";
  const activeStages = ["new", "contacted", "qualified", "proposal_sent", "negotiating", "nurture"];
  const { data: stale } = await supabase
    .from("provider_leads")
    .select(select)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .in("commercial_stage", activeStages)
    .lt("updated_at", isoBefore(now, 7 * DAY))
    .order("updated_at", { ascending: true })
    .limit(10);

  for (const lead of (stale ?? []) as Lead[]) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.PROVIDER_LEAD_STALE,
      dedupeKey: `lead:${lead.id}:stale:${dayKey(now)}`,
      entityType: "provider_lead",
      entityId: lead.id,
      title: "Provider lead needs follow-up",
      detailLines: [
        lead.business_name || "(unnamed)",
        `Stage: ${lead.commercial_stage || "unknown"}`,
        `Last update: ${ageLabel(lead.updated_at, now)}`,
      ],
      actionUrl: `/provider-ops/leads/${lead.id}`,
    });
  }

  const { data: blocked } = await supabase
    .from("provider_leads")
    .select(select)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .in("commercial_stage", ["proposal_sent", "negotiating"])
    .lt("updated_at", isoBefore(now, 3 * DAY))
    .order("updated_at", { ascending: true })
    .limit(10);

  for (const lead of (blocked ?? []) as Lead[]) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.PROVIDER_LEAD_BLOCKED,
      dedupeKey: `lead:${lead.id}:blocked:${lead.commercial_stage}:${dayKey(now)}`,
      entityType: "provider_lead",
      entityId: lead.id,
      title: "Lead blocked in critical stage",
      detailLines: [
        lead.business_name || "(unnamed)",
        `Stage: ${lead.commercial_stage}`,
        `No movement for ${ageLabel(lead.updated_at, now)}`,
      ],
      actionUrl: `/provider-ops/leads/${lead.id}`,
    });
  }

  const { data: nextStep } = await supabase
    .from("provider_leads")
    .select(select)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .in("commercial_stage", ["new", "contacted", "qualified"])
    .lt("updated_at", isoBefore(now, 48 * HOUR))
    .order("updated_at", { ascending: true })
    .limit(10);

  for (const lead of (nextStep ?? []) as Lead[]) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.PROVIDER_LEAD_OVERDUE_NEXT_STEP,
      dedupeKey: `lead:${lead.id}:next-step:${dayKey(now)}`,
      entityType: "provider_lead",
      entityId: lead.id,
      title: "Lead overdue for next step",
      detailLines: [
        lead.business_name || "(unnamed)",
        `Stage: ${lead.commercial_stage}`,
        `Last update: ${ageLabel(lead.updated_at, now)}`,
      ],
      actionUrl: `/provider-ops/leads/${lead.id}`,
    });
  }

  const { count: activeCount } = await supabase
    .from("provider_leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .not("commercial_stage", "in", `(${CLOSED_LEAD_STAGES.join(",")})`);

  if ((activeCount ?? 0) >= 50 || (stale?.length ?? 0) >= 10) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.PROVIDER_PIPELINE_HEALTH,
      dedupeKey: `provider-pipeline:health:${dayKey(now)}`,
      entityType: "provider_pipeline",
      entityId: tenantId,
      title: "Provider pipeline health threshold crossed",
      detailLines: [`Active leads: ${activeCount ?? 0}`, `Stale sample: ${stale?.length ?? 0}`, "Action: review owner load and next steps"],
      actionUrl: "/provider-ops/pipeline",
    });
  }
}

async function runFinanceAlerts(
  supabase: SupabaseAdmin,
  tenantId: string,
  now: Date,
  summary: SlackOperationalAlertSummary
) {
  type Payout = { id: string; provider_id?: string | null; amount?: number | null; currency?: string | null; status?: string | null; created_at?: string | null; updated_at?: string | null; scheduled_at?: string | null };
  const payoutSelect = "id, provider_id, amount, currency, status, created_at, updated_at, scheduled_at, providers!inner(tenant_id)";
  const { data: pendingPayouts } = await supabase
    .from("payouts")
    .select(payoutSelect)
    .eq("providers.tenant_id", tenantId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  for (const payout of (pendingPayouts ?? []) as Payout[]) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.FINANCE_PAYOUT_REQUESTED,
      dedupeKey: `payout:${payout.id}:requested:${dayKey(now)}`,
      entityType: "payout",
      entityId: payout.id,
      title: "Payout request waiting for approval",
      detailLines: [`Amount: ${payout.currency || "ZAR"} ${payout.amount ?? "unknown"}`, `Age: ${ageLabel(payout.created_at, now)}`, "Action: approve, reject, or investigate"],
      actionUrl: "/payouts",
    });
  }

  const { data: stuckPayouts } = await supabase
    .from("payouts")
    .select(payoutSelect)
    .eq("providers.tenant_id", tenantId)
    .in("status", ["processing", "failed"])
    .lt("updated_at", isoBefore(now, 48 * HOUR))
    .order("updated_at", { ascending: true })
    .limit(10);

  for (const payout of (stuckPayouts ?? []) as Payout[]) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.FINANCE_PAYOUT_EXCEPTION,
      dedupeKey: `payout:${payout.id}:exception:${payout.status}:${dayKey(now)}`,
      entityType: "payout",
      entityId: payout.id,
      title: "Payout exception needs attention",
      detailLines: [`Status: ${payout.status}`, `Amount: ${payout.currency || "ZAR"} ${payout.amount ?? "unknown"}`, `Last update: ${ageLabel(payout.updated_at, now)}`],
      actionUrl: "/payouts",
    });
  }

  const { data: refundExceptions } = await supabase
    .from("payment_transactions")
    .select("id, status, amount, refund_amount, created_at, booking:bookings!inner(tenant_id)")
    .eq("booking.tenant_id", tenantId)
    .or("transaction_type.eq.refund,refund_amount.not.is.null")
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(10);

  for (const refund of (refundExceptions ?? []) as Array<{ id: string; status?: string | null; amount?: number | null; refund_amount?: number | string | null; created_at?: string | null }>) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.FINANCE_REFUND_REVIEW,
      dedupeKey: `refund:${refund.id}:review:${refund.status}:${dayKey(now)}`,
      entityType: "payment_transaction",
      entityId: refund.id,
      title: "Refund/manual review exception",
      detailLines: [`Status: ${refund.status}`, `Amount: ${refund.refund_amount ?? refund.amount ?? "unknown"}`, `Age: ${ageLabel(refund.created_at, now)}`],
      actionUrl: "/refunds",
    });
  }

  const negativeBalances = await getNegativeBalanceProvidersForTenant(supabase, tenantId).catch(() => ({ count: 0, providers: [] }));
  if ((negativeBalances.count ?? 0) > 0) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.FINANCE_RECONCILIATION_WARNING,
      dedupeKey: `finance:negative-payout-balances:${dayKey(now)}`,
      entityType: "finance_reconciliation",
      entityId: tenantId,
      title: "Finance reconciliation warning",
      detailLines: [`Providers with negative payout balance: ${negativeBalances.count}`, "Action: review payouts before approval"],
      actionUrl: "/finance",
    });
  }

  if (
    (pendingPayouts?.length ?? 0) > 0 ||
    (stuckPayouts?.length ?? 0) > 0 ||
    (refundExceptions?.length ?? 0) > 0 ||
    (negativeBalances.count ?? 0) > 0
  ) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.REPORT_FINANCE_EXCEPTIONS_DIGEST,
      dedupeKey: `finance:exceptions-digest:${dayKey(now)}`,
      entityType: "finance_digest",
      entityId: tenantId,
      title: "Finance exception digest",
      detailLines: [
        `Pending payouts sampled: ${pendingPayouts?.length ?? 0}`,
        `Stuck payouts sampled: ${stuckPayouts?.length ?? 0}`,
        `Refund exceptions sampled: ${refundExceptions?.length ?? 0}`,
        `Negative payout balances: ${negativeBalances.count ?? 0}`,
      ],
      actionUrl: "/finance",
    });
  }
}

async function runDisputeAlerts(
  supabase: SupabaseAdmin,
  tenantId: string,
  now: Date,
  summary: SlackOperationalAlertSummary
) {
  type Dispute = { id: string; reason?: string | null; status?: string | null; opened_by?: string | null; created_at?: string | null; updated_at?: string | null };
  const select = "id, reason, status, opened_by, created_at, updated_at, booking:bookings!inner(tenant_id)";
  const { data: recentOpen } = await supabase
    .from("booking_disputes")
    .select(select)
    .eq("booking.tenant_id", tenantId)
    .eq("status", "open")
    .gte("created_at", isoBefore(now, 24 * HOUR))
    .order("created_at", { ascending: false })
    .limit(10);

  for (const dispute of (recentOpen ?? []) as Dispute[]) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.DISPUTE_NEW,
      dedupeKey: `dispute:${dispute.id}:new`,
      entityType: "booking_dispute",
      entityId: dispute.id,
      title: "New booking dispute",
      detailLines: [`Reason: ${dispute.reason || "unknown"}`, `Opened by: ${dispute.opened_by || "unknown"}`, "Action: assign owner and review booking context"],
      actionUrl: "/disputes",
    });
  }

  const { data: overdue } = await supabase
    .from("booking_disputes")
    .select(select)
    .eq("booking.tenant_id", tenantId)
    .eq("status", "open")
    .lt("created_at", isoBefore(now, 48 * HOUR))
    .order("created_at", { ascending: true })
    .limit(10);

  for (const dispute of (overdue ?? []) as Dispute[]) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.DISPUTE_OVERDUE,
      dedupeKey: `dispute:${dispute.id}:overdue:${dayKey(now)}`,
      entityType: "booking_dispute",
      entityId: dispute.id,
      title: "Dispute overdue for admin action",
      detailLines: [`Reason: ${dispute.reason || "unknown"}`, `Age: ${ageLabel(dispute.created_at, now)}`, "Action: resolve, close, or document next step"],
      actionUrl: "/disputes",
    });
  }
}

async function runSafetyAlerts(
  supabase: SupabaseAdmin,
  tenantId: string,
  now: Date,
  summary: SlackOperationalAlertSummary
) {
  type Report = { id: string; report_type?: string | null; description?: string | null; created_at?: string | null; is_adverse_finding?: boolean | null; reported_user_id?: string | null };
  const { data: reports } = await supabase
    .from("user_reports")
    .select("id, report_type, description, created_at, is_adverse_finding, reported_user_id")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  for (const report of (reports ?? []) as Report[]) {
    const eventKey: SlackEventKey = report.is_adverse_finding
      ? SLACK_EVENT_KEYS.SAFETY_ADVERSE_REPORT
      : SLACK_EVENT_KEYS.SAFETY_USER_REPORT;
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey,
      dedupeKey: `user-report:${report.id}:${report.is_adverse_finding ? "adverse" : "pending"}`,
      entityType: "user_report",
      entityId: report.id,
      title: report.is_adverse_finding ? "Adverse safety report pending" : "User report pending review",
      detailLines: [`Type: ${report.report_type || "unknown"}`, `Age: ${ageLabel(report.created_at, now)}`, report.description ? `Context: ${report.description.slice(0, 120)}` : ""],
      actionUrl: "/user-reports",
    });
  }

  type ContentReport = {
    id: string;
    target_type?: string | null;
    reason?: string | null;
    created_at?: string | null;
  };
  const overdueCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: overdueContentReports } = await supabase
    .from("content_reports")
    .select("id, target_type, reason, created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .lt("created_at", overdueCutoff)
    .order("created_at", { ascending: true })
    .limit(10);

  for (const report of (overdueContentReports ?? []) as ContentReport[]) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.SAFETY_CONTENT_REPORT_SLA,
      dedupeKey: `content-report-sla:${report.id}`,
      entityType: "content_report",
      entityId: report.id,
      title: "Content report overdue (>24h)",
      detailLines: [
        `Target: ${report.target_type || "unknown"}`,
        `Reason: ${report.reason || "unknown"}`,
        `Age: ${ageLabel(report.created_at, now)}`,
        "Action: review in Admin → Content reports",
      ],
      actionUrl: "/content-reports",
    });
  }
}

async function runVerificationAlerts(
  supabase: SupabaseAdmin,
  tenantId: string,
  now: Date,
  summary: SlackOperationalAlertSummary
) {
  // ── User identity verifications (manual uploads + SumSub customer flow) ──
  type Verification = { id: string; user_id?: string | null; submitted_at?: string | null; created_at?: string | null; verification_type?: string | null };
  const { data: pending } = await supabase
    .from("user_verifications")
    .select("id, user_id, submitted_at, created_at, verification_type")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .order("submitted_at", { ascending: true })
    .limit(10);

  for (const verification of (pending ?? []) as Verification[]) {
    const submittedAt = verification.submitted_at || verification.created_at;
    const stuck = submittedAt ? new Date(submittedAt).getTime() < now.getTime() - 48 * HOUR : false;
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: stuck ? SLACK_EVENT_KEYS.VERIFICATION_STUCK : SLACK_EVENT_KEYS.VERIFICATION_PENDING,
      dedupeKey: `verification:${verification.id}:${stuck ? "stuck" : "pending"}:${stuck ? dayKey(now) : "new"}`,
      entityType: "user_verification",
      entityId: verification.id,
      title: stuck ? "Verification stuck in review" : "Verification needs review",
      detailLines: [`Type: ${verification.verification_type || "identity"}`, `Age: ${ageLabel(submittedAt, now)}`, "Action: approve, reject, or request correction"],
      actionUrl: `/verifications/${verification.id}`,
    });
  }

  // ── Provider KYC (`provider_verification_status`) stuck in progress ──
  // Covers SumSub provider flows that produced an `in_progress` outcome and
  // haven't resolved within 24 h, as well as manual in_progress records.
  type KycRow = {
    provider_id: string;
    status: string | null;
    updated_at: string | null;
    providers: { business_name?: string | null; tenant_id?: string | null } | null;
  };
  const kycCutoff = isoBefore(now, 24 * HOUR);
  const { data: stuckKyc } = await supabase
    .from("provider_verification_status")
    .select("provider_id, status, updated_at, providers!inner(business_name, tenant_id)")
    .eq("providers.tenant_id", tenantId)
    .in("status", ["pending", "in_progress"])
    .lt("updated_at", kycCutoff)
    .order("updated_at", { ascending: true })
    .limit(10);

  for (const row of (stuckKyc ?? []) as KycRow[]) {
    const prov = Array.isArray(row.providers) ? row.providers[0] : row.providers;
    const businessName = prov?.business_name ?? null;
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.VERIFICATION_STUCK,
      dedupeKey: `provider-kyc:${row.provider_id}:stuck:${dayKey(now)}`,
      entityType: "provider_verification",
      entityId: row.provider_id,
      title: "Provider KYC stuck in review",
      detailLines: [
        businessName ? `Provider: ${businessName}` : `Provider ID: ${row.provider_id.slice(0, 8)}…`,
        `KYC status: ${row.status ?? "unknown"}`,
        `Last update: ${ageLabel(row.updated_at, now)}`,
        "Action: check SumSub or approve manually in Admin → Provider Lifecycle",
      ],
      actionUrl: `/provider-ops/providers/${row.provider_id}`,
    });
  }
}

async function runDailyDigests(
  supabase: SupabaseAdmin,
  tenantId: string,
  now: Date,
  summary: SlackOperationalAlertSummary
) {
  const [openSupport, activeLeads, openDisputes, pendingVerifications, openFraudCases] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("id, provider:providers!inner(tenant_id)", { count: "exact", head: true })
      .eq("provider.tenant_id", tenantId)
      .not("status", "in", `(${CLOSED_TICKET_STATUSES.join(",")})`),
    supabase
      .from("provider_leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .not("commercial_stage", "in", `(${CLOSED_LEAD_STAGES.join(",")})`),
    supabase
      .from("booking_disputes")
      .select("id, booking:bookings!inner(tenant_id)", { count: "exact", head: true })
      .eq("booking.tenant_id", tenantId)
      .eq("status", "open"),
    supabase
      .from("user_verifications")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending"),
    supabase
      .from("fraud_cases")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["open", "review", "held"]),
  ]);

  await emit(summary, {
    tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.REPORT_DAILY_OPERATIONS_DIGEST,
    dedupeKey: `ops-digest:${dayKey(now)}`,
    entityType: "operations_digest",
    entityId: tenantId,
    title: "Daily operations digest",
    detailLines: [
      `Open provider-linked support tickets: ${openSupport.count ?? 0}`,
      `Active provider leads: ${activeLeads.count ?? 0}`,
      `Open disputes: ${openDisputes.count ?? 0}`,
      `Pending verifications: ${pendingVerifications.count ?? 0}`,
      `Open fraud cases: ${openFraudCases.count ?? 0}`,
    ],
    actionUrl: "/",
  });
}

async function runTerminalMerchantOnboardingAlerts(
  supabase: SupabaseAdmin,
  tenantId: string,
  now: Date,
  summary: SlackOperationalAlertSummary,
) {
  const cutoff = isoBefore(now, DAY);
  const { data: stalled } = await supabase
    .from("terminal_merchant_applications")
    .select("id, application_no, status, submitted_at, assigned_admin_id, trading_name")
    .eq("tenant_id", tenantId)
    .in("status", ["submitted", "in_review", "info_required", "sent_to_acquirer", "awaiting_term_sheet"])
    .lt("submitted_at", cutoff)
    .is("assigned_admin_id", null)
    .order("submitted_at", { ascending: true })
    .limit(10);

  for (const row of stalled ?? []) {
    await emit(summary, {
      tenantId,
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.TERMINAL_MERCHANT_APPLICATION_STALLED,
      dedupeKey: `tmo:${row.id}:stalled:${dayKey(now)}`,
      entityType: "terminal_merchant_applications",
      entityId: row.id,
      title: "Terminal merchant application stalled",
      detailLines: [
        row.application_no,
        row.trading_name ?? "—",
        `Status: ${row.status}`,
        "Unassigned >24h",
      ],
      actionUrl: `/admin/commercial/terminal-onboarding/${row.id}`,
    });
  }
}
