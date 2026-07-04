/**
 * Provider-neutral identity-verification types.
 *
 * The normalized status enum is the internal representation used across
 * all channels (web, mobile, webhook, admin).  Legacy Sumsub values are
 * mapped to these statuses for backward compatibility.
 */

// ── Normalized status ────────────────────────────────────────────────────────

export const NORMALIZED_STATUSES = [
  "not_started",
  "session_created",
  "in_progress",
  "pending_review",
  "approved",
  "rejected",
  "expired",
  "abandoned",
  "requires_retry",
  "errored",
] as const;

export type NormalizedVerificationStatus = (typeof NORMALIZED_STATUSES)[number];

/** Terminal statuses: a new session may be created after these. */
export const TERMINAL_STATUSES: ReadonlySet<NormalizedVerificationStatus> = new Set([
  "approved",
  "rejected",
  "expired",
  "abandoned",
  "errored",
]);

/** Whether the status is terminal. */
export function isTerminalStatus(s: NormalizedVerificationStatus): boolean {
  return TERMINAL_STATUSES.has(s);
}

/** Approved status — gates rely on this. */
export function isApprovedStatus(s: NormalizedVerificationStatus): boolean {
  return s === "approved";
}

// ── Personas ─────────────────────────────────────────────────────────────────

export type VerificationPersona = "customer" | "provider";

// ── Session ───────────────────────────────────────────────────────────────────

export interface VerificationSession {
  id: string;
  userId: string;
  providerId?: string | null;
  persona: VerificationPersona;
  tenantId?: string | null;
  provider: "didit";
  providerSessionId?: string | null;
  workflowId?: string | null;
  status: NormalizedVerificationStatus;
  rejectionReason?: string | null;
  riskFlags?: Record<string, unknown>;
  vendorData?: string | null;
  metadata?: Record<string, unknown>;
  decision?: Record<string, unknown>;
  nameMismatchFlag?: boolean;
  identityDedupeFlag?: boolean;
  underAgeFlag?: boolean;
  lastEventAt?: string | null;
  webhookReceivedAt?: string | null;
  lastCheckedAt?: string | null;
  expiresAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Didit API shapes (subset needed by the provider) ─────────────────────────

/** Exact Didit status strings (case-sensitive). */
export type DiditStatusString =
  | "Not Started"
  | "In Progress"
  | "Resubmitted"
  | "Awaiting User"
  | "In Review"
  | "Approved"
  | "Declined"
  | "Abandoned"
  | "Expired"
  | "Kyc Expired";

export interface DiditSessionCreateParams {
  workflow_id: string;
  vendor_data: string;
  /** ISO 639-1 language code */
  language_code?: string;
  callback?: string;
  metadata?: Record<string, unknown>;
  expected_details?: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;  // YYYY-MM-DD
    nationality?: string;  // ISO 3166-1 alpha-3
    country?: string;      // ISO 3166-1 alpha-2
  };
  contact_details?: {
    email?: string;
    phone?: string;
  };
}

export interface DiditSessionCreateResult {
  session_id: string;
  session_token: string;
  url: string;
  status: DiditStatusString;
  vendor_data?: string;
  created_at?: string;
  expires_at?: string;
}

export interface DiditDecision {
  session_id: string;
  status: DiditStatusString;
  vendor_data?: string;
  id_verifications?: DiditIdVerification[];
  liveness_checks?: DiditLivenessCheck[];
  warnings?: DiditWarning[];
  created_at?: string;
  updated_at?: string;
}

export interface DiditIdVerification {
  status: DiditStatusString;
  document_type?: string;
  document_number?: string;  // NOT stored — PII
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  nationality?: string;
  issuing_country?: string;
  expiry_date?: string;
  warnings?: DiditWarning[];
}

export interface DiditLivenessCheck {
  status: DiditStatusString;
  warnings?: DiditWarning[];
}

export interface DiditWarning {
  /** Machine-readable risk code, e.g. "DOCUMENT_EXPIRED", "LOW_FACE_MATCH_SIMILARITY". */
  risk?: string;
  /** Feature that raised the warning, e.g. "ID_VERIFICATION", "FACEMATCH". */
  feature?: string;
  short_description?: string;
  long_description?: string;
  node_id?: string;
  /** @deprecated legacy field name; Didit V3 uses `risk`. */
  code?: string;
}

/**
 * Didit webhook envelope (V3). See https://docs.didit.me/integration/webhooks
 * - `webhook_type` is the event name ("status.updated", "data.updated", ...).
 * - `timestamp` / `created_at` are Unix epoch SECONDS (integers).
 */
export interface DiditWebhookPayload {
  event_id: string;
  webhook_type: string;
  session_id: string;
  business_session_id?: string;
  session_kind?: "user" | "business";
  status: DiditStatusString;
  vendor_data?: string;
  workflow_id?: string;
  workflow_version?: number;
  metadata?: Record<string, unknown>;
  trigger?: string;
  decision?: DiditDecision;
  resubmit_info?: { nodes_to_resubmit?: unknown[]; reasons?: Record<string, string> };
  timestamp?: number;
  created_at?: number;
  environment?: "live" | "sandbox";
  application_id?: string;
}

// ── Session creation inputs/outputs ──────────────────────────────────────────

export interface CreateSessionInput {
  userId: string;
  providerId?: string | null;
  persona: VerificationPersona;
  tenantId?: string | null;
  languageCode?: string;
  returnTo?: string;
  /** Pre-filled from confirm-legal-details form (cross_validate). */
  confirmedLegalDetails?: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    country: string;
    nationality?: string;
  };
}

export interface CreateSessionOutput {
  sessionId: string;
  providerSessionId: string;
  sessionToken: string;
  url: string;
  isExisting: boolean;
}

// ── Policy ────────────────────────────────────────────────────────────────────

export interface VerificationPolicyDigest {
  diditEnabled: boolean;
  manualEnabled: boolean;
  mode: "off" | "manual" | "didit" | "both";
  requiredForProviders: boolean;
  requiredForPayouts: boolean;
  requiredForCustomers: boolean;
  crossValidate: boolean;
  minAge: number;
  dedupeEnabled: boolean;
}

// ── Payout name match ─────────────────────────────────────────────────────────

export type PayoutNameMatchStatus =
  | "match_ok"
  | "business_name_match"
  | "owner_fallback_match"
  | "needs_review"
  | "mismatch";
