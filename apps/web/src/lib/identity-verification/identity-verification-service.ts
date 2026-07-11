/**
 * Provider-neutral identity-verification service.
 *
 * All business logic for session creation, status retrieval, webhook
 * processing, and gate-read lives here.  Only this module talks to the DB
 * and Didit provider.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  createDiditSession,
  diditEnvPresent,
  diditTimestampToIso,
  extractLegalIdentityFromDecision,
  extractRejectionReason,
  getDiditDecision,
  getEffectiveDiditWorkflowId,
  getEffectiveDiditKybWorkflowId,
  isKycExpired,
  normalizeDiditStatus,
  sanitiseDecisionForStorage,
} from "./provider/didit-provider";
import { userFacingDiditSessionCreateMessage } from "./user-facing-didit-errors";
import type {
  CreateSessionInput,
  CreateSessionOutput,
  DiditWebhookPayload,
  NormalizedVerificationStatus,
  VerificationPersona,
  VerificationSession,
} from "./types";
import { isTerminalStatus, TERMINAL_STATUSES } from "./types";
import { resolveVerificationPolicy } from "@/lib/verification/verification-policy";
import { syncProviderVerificationStateFromDidit } from "@/lib/verification/sync-provider-verification";
import { notifyIdentityVerificationReviewed } from "@/lib/verification/notify-identity-verification-reviewed";
import {
  slackNotifyVerificationNeedsReview,
  slackNotifyVerificationRejected,
} from "@/lib/integrations/slack/ops-triggers";

// ── Error codes ───────────────────────────────────────────────────────────────

export class IdentityVerificationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "IdentityVerificationError";
  }
}

export const IV_ERROR = {
  ALREADY_APPROVED:         "VERIFICATION_ALREADY_APPROVED",
  SESSION_CREATE_FAILED:    "DIDIT_SESSION_CREATE_FAILED",
  SESSION_NOT_FOUND:        "DIDIT_SESSION_NOT_FOUND",
  WEBHOOK_SIGNATURE_INVALID:"DIDIT_WEBHOOK_SIGNATURE_INVALID",
  SESSION_EXPIRED:          "VERIFICATION_SESSION_EXPIRED",
  RETRY_REQUIRED:           "VERIFICATION_RETRY_REQUIRED",
  PROVIDER_UNAVAILABLE:     "PROVIDER_UNAVAILABLE",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildVendorData(persona: VerificationPersona, id: string): string {
  return persona === "customer" ? `user:${id}` : `provider:${id}`;
}

function buildBusinessVendorData(providerId: string): string {
  return `provider:${providerId}:kyb`;
}

function buildCallback(persona: VerificationPersona, appUrl: string, returnTo?: string): string {
  const base = (appUrl || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const path = persona === "customer"
    ? "/account-settings/identity-verification"
    : "/provider/settings/verification";
  const url = new URL(`${base}${path}`);
  if (returnTo) url.searchParams.set("return_to", returnTo);
  return url.toString();
}

// ── Session creation ──────────────────────────────────────────────────────────

export async function createVerificationSession(
  input: CreateSessionInput,
): Promise<CreateSessionOutput> {
  const { userId, providerId, persona, tenantId, languageCode, returnTo, confirmedLegalDetails } = input;
  const supabase = getSupabaseAdmin();

  // Check policy: if Didit not available, throw
  const policy = await resolveVerificationPolicy(tenantId ?? null);
  if (!policy.diditEnabled) {
    throw new IdentityVerificationError(
      "Identity verification is not available",
      IV_ERROR.PROVIDER_UNAVAILABLE,
      503,
    );
  }

  // Guard: already approved?
  const existingApproved = await getApprovedSession(userId, persona, providerId ?? null);
  if (existingApproved) {
    throw new IdentityVerificationError(
      "Identity is already verified",
      IV_ERROR.ALREADY_APPROVED,
      409,
    );
  }

  // Reuse live non-terminal session
  const isProviderPersona = persona === "provider" && Boolean(providerId);
  const TERMINAL = `("approved","rejected","expired","abandoned","errored")`;

  let liveQuery = supabase
    .from("identity_verification_sessions")
    .select("id, provider_session_id, session_url, status")
    .eq("persona_type", persona)
    .eq("session_kind", "user")
    .not("status", "in", TERMINAL);

  if (isProviderPersona) {
    liveQuery = liveQuery.eq("provider_id", providerId!);
  } else {
    liveQuery = liveQuery.eq("user_id", userId);
  }

  const { data: liveSession } = await liveQuery.maybeSingle();

  // Create new Didit session parameters
  const entityId = persona === "provider" && providerId ? providerId : userId;
  const vendorData = buildVendorData(persona, entityId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const callback = buildCallback(persona, appUrl, returnTo);

  if (liveSession && liveSession.provider_session_id) {
    const storedUrl = (liveSession.session_url as string | null) ?? "";
    if (storedUrl) {
      // Hosted URL embeds the session token and is valid until session expiry.
      return {
        sessionId:         liveSession.id as string,
        providerSessionId: liveSession.provider_session_id as string,
        sessionToken:      "",
        url:               storedUrl,
        isExisting:        true,
      };
    }
    // Legacy row without a stored URL: Didit's create endpoint is idempotent on
    // vendor_data and returns the SAME unfinished session (with URL). Recover the
    // URL, back-fill the existing row (no new insert → unique index preserved).
    try {
      const recovered = await createDiditSession({
        workflow_id: getEffectiveDiditWorkflowId(),
        vendor_data: vendorData,
        language_code: languageCode,
        callback,
        metadata: { persona, tenant_id: tenantId, channel: "web", return_to: returnTo },
      });
      await supabase
        .from("identity_verification_sessions")
        .update({
          provider_session_id: recovered.session_id,
          session_url:         recovered.url ?? null,
          last_checked_at:     new Date().toISOString(),
        })
        .eq("id", liveSession.id);
      return {
        sessionId:         liveSession.id as string,
        providerSessionId: recovered.session_id,
        sessionToken:      recovered.session_token,
        url:               recovered.url,
        isExisting:        true,
      };
    } catch (err) {
      console.error("[identity-verification] Didit session recover failed:", err);
      throw new IdentityVerificationError(
        userFacingDiditSessionCreateMessage(err),
        IV_ERROR.SESSION_CREATE_FAILED,
        502,
      );
    }
  }

  const params: Parameters<typeof createDiditSession>[0] = {
    workflow_id: getEffectiveDiditWorkflowId(),
    vendor_data: vendorData,
    language_code: languageCode,
    callback,
    metadata: { persona, tenant_id: tenantId, channel: "web", return_to: returnTo },
  };

  if (confirmedLegalDetails && policy.crossValidate) {
    params.expected_details = {
      firstName:   confirmedLegalDetails.firstName,
      lastName:    confirmedLegalDetails.lastName,
      dateOfBirth: confirmedLegalDetails.dateOfBirth,
      country:     confirmedLegalDetails.country,
      ...(confirmedLegalDetails.nationality
        ? { nationality: confirmedLegalDetails.nationality }
        : {}),
    };
  }

  let diditResult: Awaited<ReturnType<typeof createDiditSession>>;
  try {
    diditResult = await createDiditSession(params);
  } catch (err) {
    console.error("[identity-verification] Didit session create failed:", err);
    throw new IdentityVerificationError(
      userFacingDiditSessionCreateMessage(err),
      IV_ERROR.SESSION_CREATE_FAILED,
      502,
    );
  }

  const normalizedStatus = normalizeDiditStatus(diditResult.status);

  // Store session row
  const { data: newSession, error: insertErr } = await supabase
    .from("identity_verification_sessions")
    .insert({
      user_id:            userId,
      provider_id:        providerId ?? null,
      persona_type:       persona,
      tenant_id:          tenantId ?? null,
      provider:           "didit",
      provider_session_id:diditResult.session_id,
      workflow_id:        getEffectiveDiditWorkflowId(),
      session_kind:       "user",
      status:             normalizedStatus,
      vendor_data:        vendorData,
      session_url:        diditResult.url ?? null,
      metadata:           { persona, tenant_id: tenantId, channel: "web", return_to: returnTo },
      expires_at:         diditResult.expires_at ?? null,
      last_checked_at:    new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !newSession) {
    throw new IdentityVerificationError(
      "Failed to store verification session",
      IV_ERROR.SESSION_CREATE_FAILED,
      500,
    );
  }

  return {
    sessionId:         newSession.id,
    providerSessionId: diditResult.session_id,
    sessionToken:      diditResult.session_token,
    url:               diditResult.url,
    isExisting:        false,
  };
}

// ── Status retrieval ──────────────────────────────────────────────────────────

export async function getVerificationStatus(
  userId: string,
  persona: VerificationPersona,
  providerId?: string | null,
  sessionKind: "user" | "business" = "user",
): Promise<NormalizedVerificationStatus> {
  const supabase = getSupabaseAdmin();

  let q = supabase
    .from("identity_verification_sessions")
    .select("id, status, provider_session_id, last_checked_at")
    .eq("persona_type", persona)
    .eq("session_kind", sessionKind)
    .order("created_at", { ascending: false })
    .limit(1);

  if (persona === "provider" && providerId) {
    q = q.eq("provider_id", providerId);
  } else {
    q = q.eq("user_id", userId);
  }

  const { data: row } = await q.maybeSingle();
  if (!row) return "not_started";

  const status = row.status as NormalizedVerificationStatus;

  // Trigger reconciliation if non-terminal and stale (>5 min)
  if (!isTerminalStatus(status) && row.provider_session_id) {
    const lastChecked = row.last_checked_at ? new Date(row.last_checked_at).getTime() : 0;
    const staleMs = Date.now() - lastChecked;
    if (staleMs > 5 * 60 * 1000) {
      // Fire-and-forget reconciliation
      void reconcileSession(row.id, row.provider_session_id);
    }
  }

  return status;
}

/** Latest business KYB session status for a provider. */
export async function getBusinessVerificationStatus(
  providerId: string,
): Promise<NormalizedVerificationStatus | "not_required"> {
  const supabase = getSupabaseAdmin();
  const { data: row } = await supabase
    .from("identity_verification_sessions")
    .select("id, status, provider_session_id, last_checked_at")
    .eq("provider_id", providerId)
    .eq("persona_type", "provider")
    .eq("session_kind", "business")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return "not_started";

  const status = row.status as NormalizedVerificationStatus;
  if (!isTerminalStatus(status) && row.provider_session_id) {
    const lastChecked = row.last_checked_at ? new Date(row.last_checked_at).getTime() : 0;
    if (Date.now() - lastChecked > 5 * 60 * 1000) {
      void reconcileSession(row.id, row.provider_session_id as string);
    }
  }
  return status;
}

export interface CreateBusinessSessionInput {
  userId: string;
  providerId: string;
  tenantId?: string | null;
  languageCode?: string;
  returnTo?: string;
}

/** Create or reuse a Didit KYB session for a registered business provider. */
export async function createBusinessVerificationSession(
  input: CreateBusinessSessionInput,
): Promise<CreateSessionOutput> {
  const { userId, providerId, tenantId, languageCode, returnTo } = input;
  const supabase = getSupabaseAdmin();

  const policy = await resolveVerificationPolicy(tenantId ?? null);
  if (!policy.kybEnabled) {
    throw new IdentityVerificationError(
      "Business verification is not available",
      IV_ERROR.PROVIDER_UNAVAILABLE,
      503,
    );
  }

  const kybWorkflowId = getEffectiveDiditKybWorkflowId();
  if (!kybWorkflowId) {
    throw new IdentityVerificationError(
      "KYB workflow is not configured",
      IV_ERROR.PROVIDER_UNAVAILABLE,
      503,
    );
  }

  const { data: providerRow } = await supabase
    .from("providers")
    .select(
      "payee_kind, registered_business_name, business_registration_number, business_registration_country",
    )
    .eq("id", providerId)
    .maybeSingle();

  if ((providerRow as { payee_kind?: string } | null)?.payee_kind !== "business") {
    throw new IdentityVerificationError(
      "Business verification is only for registered companies",
      "PAYEE_KIND_NOT_BUSINESS",
      400,
    );
  }

  const personApproved = await getApprovedSession(userId, "provider", providerId);
  if (!personApproved && policy.kybRequiredForBusiness) {
    throw new IdentityVerificationError(
      "Complete identity verification before verifying your business",
      "PERSON_KYC_REQUIRED_FIRST",
      409,
    );
  }

  const existingKybApproved = await getApprovedBusinessSession(providerId);
  if (existingKybApproved) {
    throw new IdentityVerificationError(
      "Business is already verified",
      IV_ERROR.ALREADY_APPROVED,
      409,
    );
  }

  const TERMINAL = `("approved","rejected","expired","abandoned","errored")`;
  const { data: liveSession } = await supabase
    .from("identity_verification_sessions")
    .select("id, provider_session_id, session_url, status")
    .eq("provider_id", providerId)
    .eq("persona_type", "provider")
    .eq("session_kind", "business")
    .not("status", "in", TERMINAL)
    .maybeSingle();

  const vendorData = buildBusinessVendorData(providerId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const callback = buildCallback("provider", appUrl, returnTo);

  const regName =
    (providerRow as { registered_business_name?: string | null }).registered_business_name ?? "";
  const regNumber =
    (providerRow as { business_registration_number?: string | null })
      .business_registration_number ?? "";
  const regCountry =
    (providerRow as { business_registration_country?: string | null })
      .business_registration_country ?? "";

  if (liveSession?.provider_session_id) {
    const storedUrl = (liveSession.session_url as string | null) ?? "";
    if (storedUrl) {
      return {
        sessionId: liveSession.id as string,
        providerSessionId: liveSession.provider_session_id as string,
        sessionToken: "",
        url: storedUrl,
        isExisting: true,
      };
    }
  }

  let diditResult: Awaited<ReturnType<typeof createDiditSession>>;
  try {
    diditResult = await createDiditSession({
      workflow_id: kybWorkflowId,
      vendor_data: vendorData,
      language_code: languageCode,
      callback,
      metadata: {
        persona: "provider",
        session_kind: "business",
        tenant_id: tenantId,
        registered_business_name: regName,
        business_registration_number: regNumber,
        business_registration_country: regCountry,
        return_to: returnTo,
      },
    });
  } catch (err) {
    console.error("[identity-verification] Didit KYB session create failed:", err);
    throw new IdentityVerificationError(
      userFacingDiditSessionCreateMessage(err),
      IV_ERROR.SESSION_CREATE_FAILED,
      502,
    );
  }

  const normalizedStatus = normalizeDiditStatus(diditResult.status);
  const businessSnapshot = {
    registered_business_name: regName,
    business_registration_number: regNumber,
    business_registration_country: regCountry,
  };

  if (liveSession?.id) {
    await supabase
      .from("identity_verification_sessions")
      .update({
        provider_session_id: diditResult.session_id,
        session_url: diditResult.url ?? null,
        workflow_id: kybWorkflowId,
        status: normalizedStatus,
        business_snapshot: businessSnapshot,
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", liveSession.id);

    return {
      sessionId: liveSession.id as string,
      providerSessionId: diditResult.session_id,
      sessionToken: diditResult.session_token,
      url: diditResult.url,
      isExisting: true,
    };
  }

  const { data: newSession, error: insertErr } = await supabase
    .from("identity_verification_sessions")
    .insert({
      user_id: userId,
      provider_id: providerId,
      persona_type: "provider",
      tenant_id: tenantId ?? null,
      provider: "didit",
      provider_session_id: diditResult.session_id,
      workflow_id: kybWorkflowId,
      session_kind: "business",
      status: normalizedStatus,
      vendor_data: vendorData,
      session_url: diditResult.url ?? null,
      business_snapshot: businessSnapshot,
      metadata: {
        persona: "provider",
        session_kind: "business",
        tenant_id: tenantId,
        return_to: returnTo,
      },
      expires_at: diditResult.expires_at ?? null,
      last_checked_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !newSession) {
    throw new IdentityVerificationError(
      "Failed to store business verification session",
      IV_ERROR.SESSION_CREATE_FAILED,
      500,
    );
  }

  await supabase
    .from("providers")
    .update({ kyb_verification_status: "in_progress" })
    .eq("id", providerId);

  return {
    sessionId: newSession.id,
    providerSessionId: diditResult.session_id,
    sessionToken: diditResult.session_token,
    url: diditResult.url,
    isExisting: false,
  };
}

async function getApprovedBusinessSession(providerId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("identity_verification_sessions")
    .select("id")
    .eq("provider_id", providerId)
    .eq("session_kind", "business")
    .eq("status", "approved")
    .maybeSingle();
  return Boolean(data);
}

// ── Approved check ────────────────────────────────────────────────────────────

async function getApprovedSession(
  userId: string,
  persona: VerificationPersona,
  providerId: string | null,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from("identity_verification_sessions")
    .select("id")
    .eq("persona_type", persona)
    .eq("session_kind", "user")
    .eq("status", "approved");

  if (persona === "provider" && providerId) {
    q = q.eq("provider_id", providerId);
  } else {
    q = q.eq("user_id", userId);
  }

  const { data } = await q.maybeSingle();
  return Boolean(data);
}

// ── Webhook processing ────────────────────────────────────────────────────────

export async function handleVerificationWebhook(
  payload: DiditWebhookPayload,
  rawBody: Buffer,
  eventId: string,
  signatureVariant: "v2" | "raw" | "simple",
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Idempotency: if event_id already processed, no-op
  const { data: existingEvent } = await supabase
    .from("identity_verification_events")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingEvent) return; // already processed

  // Find session — KYB webhooks may reference business_session_id
  const lookupIds = [
    payload.session_id,
    payload.business_session_id,
  ].filter((id): id is string => Boolean(id));

  let session: Record<string, unknown> | null = null;
  for (const lookupId of lookupIds) {
    const { data } = await supabase
      .from("identity_verification_sessions")
      .select("*")
      .eq("provider_session_id", lookupId)
      .maybeSingle();
    if (data) {
      session = data as Record<string, unknown>;
      break;
    }
  }

  if (!session) {
    console.warn(`[webhook/didit] Unknown session ${payload.session_id}`);
    return;
  }

  const sessionId = String(session.id);
  const eventTimestamp = diditTimestampToIso(payload.timestamp ?? payload.created_at);
  const currentLastEventAt =
    typeof session.last_event_at === "string" ? session.last_event_at : null;

  // Monotonicity: only apply if this event is newer than last applied
  if (currentLastEventAt && new Date(eventTimestamp) <= new Date(currentLastEventAt)) {
    // Still store the event for audit, but don't apply
    await storeEvent(supabase, sessionId, eventId, payload, rawBody, signatureVariant);
    return;
  }

  const newNormalized = normalizeDiditStatus(payload.status);
  const currentStatus = session.status as NormalizedVerificationStatus;

  // Terminal safety: approved can only move to expired (Kyc Expired)
  if (currentStatus === "approved" && newNormalized !== "expired") {
    await storeEvent(supabase, sessionId, eventId, payload, rawBody, signatureVariant);
    return;
  }

  // The "simple" signature variant authenticates only the envelope, NOT `decision`.
  // Re-fetch the authoritative decision from the API before trusting it.
  let decisionSource: Record<string, unknown> | null =
    (payload.decision as unknown as Record<string, unknown> | null) ?? null;
  let statusSource: string = payload.status;
  if (signatureVariant === "simple") {
    const decisionSessionId = payload.session_id || payload.business_session_id;
    if (decisionSessionId) {
      try {
        const fetched = await getDiditDecision(decisionSessionId);
        decisionSource = fetched as unknown as Record<string, unknown>;
        statusSource = fetched.status ?? payload.status;
      } catch (err) {
        console.warn("[webhook/didit] simple-variant decision re-fetch failed:", err);
      }
    }
  }

  const kycExpiry = isKycExpired(statusSource);
  const sanitisedDecision = sanitiseDecisionForStorage(decisionSource);
  const rejectionReason = extractRejectionReason(sanitisedDecision);

  // Check for name / DOB mismatch warning (Didit V3 uses `risk`, legacy used `code`)
  const warnings = extractWarnings(decisionSource);
  const nameMismatch = warnings.some(w => {
    const risk = (w.risk ?? w.code ?? "").toLowerCase();
    const desc = (w.short_description ?? "").toLowerCase();
    return (
      risk.includes("name_mismatch") ||
      risk.includes("dob_mismatch") ||
      risk.includes("data_mismatch") ||
      risk.includes("name_score") ||
      desc.includes("name") ||
      desc.includes("date of birth")
    );
  });

  // Update session status
  const updateData: Record<string, unknown> = {
    status:             newNormalized,
    last_event_at:      eventTimestamp,
    webhook_received_at:new Date().toISOString(),
    last_checked_at:    new Date().toISOString(),
    rejection_reason:   rejectionReason,
    decision:           sanitisedDecision,
    ...(nameMismatch ? { name_mismatch_flag: true } : {}),
  };

  if (newNormalized === "approved" || newNormalized === "rejected") {
    updateData.completed_at = new Date().toISOString();
  }

  await supabase
    .from("identity_verification_sessions")
    .update(updateData)
    .eq("id", sessionId);

  // Store event log
  await storeEvent(supabase, sessionId, eventId, payload, rawBody, signatureVariant);

  // Sync to legacy columns + audit + notify
  await syncLegacyColumns(
    supabase,
    session,
    newNormalized,
    rejectionReason,
    kycExpiry,
    decisionSource,
  );

  // Notify user on terminal transitions
  const isApproved = newNormalized === "approved";
  const isRejected = newNormalized === "rejected";
  const isPendingReview = newNormalized === "pending_review";
  if (isApproved || isRejected) {
    try {
      await notifyIdentityVerificationReviewed({
        userId: session.user_id as string,
        outcome: isApproved ? "approved" : "rejected",
        rejectionReason,
        isProvider: (session.persona_type as string) === "provider",
      });
    } catch (err) {
      console.warn("[webhook/didit] notification failed:", err);
    }
  }

  // Ops Slack alerts for Didit review outcomes (manual upload already does this separately)
  const tenantId = (session.tenant_id as string | null) ?? "platform";
  const isBusinessSession = (session.session_kind as string | undefined) === "business";
  const isProviderPersona = (session.persona_type as string) === "provider";
  const slackSource = isBusinessSession
    ? "didit_kyb"
    : isProviderPersona
      ? "didit_provider"
      : "didit_customer";
  const sessionsActionUrl = `/admin/identity-trust/sessions`;

  try {
    if (isPendingReview) {
      slackNotifyVerificationNeedsReview({
        tenantId,
        verificationId: sessionId,
        documentType: "didit",
        source: slackSource,
        detail: rejectionReason ?? "Didit session moved to In Review",
        actionUrl: sessionsActionUrl,
        entityType: "identity_verification_session",
      });
    } else if (isRejected) {
      slackNotifyVerificationRejected({
        tenantId,
        verificationId: sessionId,
        source: slackSource,
        detail: rejectionReason ?? "Didit verification declined",
        actionUrl: sessionsActionUrl,
        entityType: "identity_verification_session",
      });
    }
  } catch (err) {
    console.warn("[webhook/didit] slack notify failed:", err);
  }
}

async function storeEvent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessionId: string,
  eventId: string,
  payload: DiditWebhookPayload,
  rawBody: Buffer,
  signatureVariant: string,
) {
  // Sanitise payload for storage
  const sanitisedPayload = sanitiseDecisionForStorage(payload as unknown as Record<string, unknown>);

  // upsert with onConflict=event_id to satisfy the unique constraint idempotently
  await supabase
    .from("identity_verification_events")
    .upsert(
      {
        session_id:         sessionId,
        event_id:           eventId,
        webhook_type:       payload.webhook_type,
        status:             payload.status,
        signature_variant:  signatureVariant,
        raw_payload:        sanitisedPayload,
      },
      { onConflict: "event_id", ignoreDuplicates: true },
    );
}

interface ParsedWarning { risk?: string; code?: string; short_description?: string }

function extractWarnings(decision: unknown): ParsedWarning[] {
  const results: ParsedWarning[] = [];
  function walk(obj: unknown) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    const o = obj as Record<string, unknown>;
    // Didit V3 warnings carry `risk` + `short_description`; legacy used `code`.
    const hasRisk = typeof o.risk === "string";
    const hasCode = typeof o.code === "string";
    if ((hasRisk || hasCode) && (typeof o.short_description === "string" || hasRisk || hasCode)) {
      results.push({
        risk: hasRisk ? (o.risk as string) : undefined,
        code: hasCode ? (o.code as string) : undefined,
        short_description: typeof o.short_description === "string" ? o.short_description : undefined,
      });
    }
    Object.values(o).forEach(walk);
  }
  walk(decision);
  return results;
}

// ── KYB legacy sync ───────────────────────────────────────────────────────────

function mapNormalizedToKybStatus(
  normalized: NormalizedVerificationStatus,
): string {
  if (normalized === "approved") return "approved";
  if (normalized === "rejected") return "rejected";
  if (normalized === "pending_review") return "pending_review";
  if (normalized === "expired") return "expired";
  if (
    normalized === "in_progress" ||
    normalized === "session_created" ||
    normalized === "requires_retry"
  ) {
    return "in_progress";
  }
  return "not_started";
}

async function syncProviderKybStatus(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  providerId: string,
  normalized: NormalizedVerificationStatus,
  _rejectionReason: string | null,
) {
  await supabase
    .from("providers")
    .update({ kyb_verification_status: mapNormalizedToKybStatus(normalized) })
    .eq("id", providerId);
}

function extractBusinessSnapshotFromDecision(
  decision: Record<string, unknown>,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  const business = decision.business_verification as Record<string, unknown> | undefined;
  if (business) {
    if (typeof business.company_name === "string") {
      snapshot.registry_company_name = business.company_name;
    }
    if (typeof business.registration_number === "string") {
      snapshot.registry_registration_number = business.registration_number;
    }
    if (typeof business.country === "string") {
      snapshot.registry_country = business.country;
    }
  }
  return snapshot;
}

// ── Legacy column sync ────────────────────────────────────────────────────────

async function syncLegacyColumns(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  session: Record<string, unknown>,
  normalized: NormalizedVerificationStatus,
  rejectionReason: string | null,
  kycExpiry: boolean,
  decision: Record<string, unknown> | null,
) {
  const userId   = session.user_id   as string;
  const persona  = session.persona_type as VerificationPersona;
  const providerId = session.provider_id as string | null;
  const sessionId  = session.id as string;
  const sessionKind = (session.session_kind as string | undefined) ?? "user";

  if (sessionKind === "business" && providerId) {
    await syncProviderKybStatus(
      supabase,
      providerId,
      normalized,
      rejectionReason,
    );
    if (normalized === "approved" && decision) {
      const snapshot = extractBusinessSnapshotFromDecision(decision);
      if (Object.keys(snapshot).length > 0) {
        await supabase
          .from("identity_verification_sessions")
          .update({ business_snapshot: snapshot })
          .eq("id", sessionId);
      }
    }
    return;
  }

  if (persona === "customer") {
    await syncCustomerVerificationState(supabase, userId, normalized, sessionId);
  } else if (persona === "provider" && providerId) {
    await syncProviderVerificationStateFromDidit(
      providerId,
      normalized,
      rejectionReason,
      sessionId,
      { kycCredentialExpired: kycExpiry },
    );
    // KYC expiry: re-lock provider gates (but preserve manual admin override)
    if (kycExpiry) {
      await handleKycExpiryForProvider(supabase, providerId, userId);
    }
  }

  // On approval, persist authoritative legal identity from document
  if (normalized === "approved" && decision) {
    const legalId = extractLegalIdentityFromDecision(decision);
    if (legalId) {
      await persistLegalIdentity(supabase, userId, legalId);
    }
  }
}

async function syncCustomerVerificationState(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  normalized: NormalizedVerificationStatus,
  sessionId: string,
) {
  const isApproved  = normalized === "approved";
  const legacyStatus = normalized === "approved"  ? "approved"
    : normalized === "pending_review"             ? "under_review"
    : normalized === "rejected"                   ? "rejected"
    : normalized === "expired"                    ? "expired"
    : "not_started";

  await supabase
    .from("users")
    .update({
      identity_verified:             isApproved,
      identity_verification_status:  legacyStatus,
    })
    .eq("id", userId);

  // Upsert user_verifications row
  const { data: existingUv } = await supabase
    .from("user_verifications")
    .select("id")
    .eq("user_id", userId)
    .eq("document_type", "didit")
    .maybeSingle();

  if (existingUv) {
    await supabase
      .from("user_verifications")
      .update({ status: legacyStatus, didit_session_id: sessionId })
      .eq("id", existingUv.id);
  } else {
    await supabase
      .from("user_verifications")
      .upsert({
        user_id:          userId,
        document_type:    "didit",
        status:           legacyStatus,
        didit_session_id: sessionId,
      }, { onConflict: "user_id,document_type" });
  }
}

async function handleKycExpiryForProvider(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  providerId: string,
  userId: string,
) {
  // Re-lock provider_verification_status (but NOT providers.is_verified if manually set by admin)
  await supabase
    .from("provider_verification_status")
    .update({ status: "expired" })
    .eq("provider_id", providerId);

  await supabase
    .from("users")
    .update({ identity_verified: false, identity_verification_status: "expired" })
    .eq("id", userId);

  // Check if provider.is_verified was manually set by admin
  const { data: provRow } = await supabase
    .from("providers")
    .select("is_verified")
    .eq("id", providerId)
    .maybeSingle();

  if (provRow?.is_verified) {
    // Flag for superadmin: "KYC expired but manually verified"
    await supabase
      .from("identity_verification_sessions")
      .update({ risk_flags: { kyc_expired_manual_override: true } })
      .eq("provider_id", providerId)
      .eq("status", "expired");
  }
}

async function persistLegalIdentity(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  legalId: {
    firstName?: string; lastName?: string; dateOfBirth?: string;
    nationality?: string; documentType?: string; documentCountry?: string;
  },
) {
  const update: Record<string, unknown> = {
    legal_identity_source:      "didit",
    legal_identity_verified_at: new Date().toISOString(),
  };
  if (legalId.firstName)      update.legal_first_name          = legalId.firstName;
  if (legalId.lastName)       update.legal_last_name           = legalId.lastName;
  if (legalId.dateOfBirth)    update.legal_date_of_birth       = legalId.dateOfBirth;
  if (legalId.nationality)    update.legal_nationality         = legalId.nationality;
  if (legalId.documentType)   update.legal_id_document_type   = legalId.documentType;
  if (legalId.documentCountry)update.legal_id_document_country= legalId.documentCountry;

  await supabase.from("users").update(update).eq("id", userId);
}

// ── Reconciliation ────────────────────────────────────────────────────────────

export async function reconcileSession(
  sessionId: string,
  providerSessionId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  try {
    const decision = await getDiditDecision(providerSessionId);
    const normalized = normalizeDiditStatus(decision.status);

    const { data: session } = await supabase
      .from("identity_verification_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session) return;

    const currentStatus = session.status as NormalizedVerificationStatus;
    // Terminal safety: don't regress approved
    if (currentStatus === "approved" && normalized !== "expired") {
      await supabase
        .from("identity_verification_sessions")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("id", sessionId);
      return;
    }

    const sanitisedDecision = sanitiseDecisionForStorage(decision as unknown as Record<string, unknown>);
    const rejectionReason = extractRejectionReason(sanitisedDecision);
    const kycExpiry = isKycExpired(decision.status);

    await supabase
      .from("identity_verification_sessions")
      .update({
        status:          normalized,
        decision:        sanitisedDecision,
        rejection_reason:rejectionReason,
        last_checked_at: new Date().toISOString(),
        last_event_at:   decision.updated_at ?? new Date().toISOString(),
      })
      .eq("id", sessionId);

    await syncLegacyColumns(
      supabase,
      session,
      normalized,
      rejectionReason,
      kycExpiry,
      decision as unknown as Record<string, unknown>,
    );
  } catch (err) {
    console.warn(`[reconcile] session ${sessionId} failed:`, err);
    await supabase
      .from("identity_verification_sessions")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", sessionId);
  }
}

// ── Payout-name matching ──────────────────────────────────────────────────────

/** Normalise a name for comparison: lowercase, strip legal suffixes, fold accents, etc. */
function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/\p{Mn}/gu, "")      // fold accents
    .replace(/\(pty\)\s*ltd\.?/gi, "")
    .replace(/\bcc\b/gi, "")
    .replace(/\binc\.?\b/gi, "")
    .replace(/\bltd\.?\b/gi, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(normaliseName(s).split(" ").filter(Boolean));
}

function namesMatch(a: string, b: string): boolean {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (na === nb) return true;
  // Token-overlap: all tokens of shorter must be in longer
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  const overlap = [...small].filter(t => big.has(t)).length;
  return overlap >= Math.ceil(small.size * 0.8);
}

import type { PayoutNameMatchStatus } from "./types";

export function computePayoutNameMatch(params: {
  accountName: string;
  payeeKind: "individual" | "business";
  verifiedLegalName?: string | null;
  registeredBusinessName?: string | null;
}): PayoutNameMatchStatus {
  const { accountName, payeeKind, verifiedLegalName, registeredBusinessName } = params;
  if (!accountName) return "needs_review";

  if (payeeKind === "individual") {
    if (!verifiedLegalName) return "needs_review";
    return namesMatch(accountName, verifiedLegalName) ? "match_ok" : "mismatch";
  }

  // Business
  if (registeredBusinessName && namesMatch(accountName, registeredBusinessName)) {
    return "business_name_match";
  }
  if (verifiedLegalName && namesMatch(accountName, verifiedLegalName)) {
    return "owner_fallback_match";
  }
  if (!registeredBusinessName && !verifiedLegalName) {
    return "needs_review";
  }
  return "mismatch";
}
