import { createHash } from "crypto";
import type { UserPurgeSnapshot, ProviderOrgPurgeSnapshot } from "@/lib/account/compliance-purge-snapshot";

export type UserPurgeSnapshotRedacted = {
  schema_version: 3;
  user_id: string;
  /** SHA-256 hex of normalized email (for dedupe; not reversible without salt brute-force). */
  email_hash: string | null;
  role: string | null;
  created_at: string | null;
  counts: UserPurgeSnapshot["counts"];
};

export type ProviderOrgPurgeSnapshotRedacted = {
  schema_version: 3;
  provider_id: string;
  business_name: string | null;
  slug: string | null;
  /** Hashed billing/public emails only — no cleartext. */
  provider_email_hash: string | null;
  provider_billing_email_hash: string | null;
  owner_user_id: string | null;
  owner_email_hash: string | null;
  tenant_id: string | null;
  stats: ProviderOrgPurgeSnapshot["stats"];
  staff_login_user_ids: string[];
};

function snapshotHashSecret(): string {
  return (
    process.env.COMPLIANCE_SNAPSHOT_HASH_SECRET?.trim() ||
    process.env.ACCOUNT_DELETION_LINK_SECRET?.trim() ||
    process.env.RETENTION_LINK_SECRET?.trim() ||
    "beautonomi-compliance-snapshot-dev-only"
  );
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** One-way hash for audit retention (dedupe / support correlation without storing cleartext). */
export function hashEmailForComplianceSnapshot(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  return createHash("sha256")
    .update(`${snapshotHashSecret()}|${normalizeEmail(email)}`)
    .digest("hex");
}

export function redactUserPurgeSnapshot(snapshot: UserPurgeSnapshot): UserPurgeSnapshotRedacted {
  return {
    schema_version: 3,
    user_id: snapshot.user_id,
    email_hash: hashEmailForComplianceSnapshot(snapshot.email),
    role: snapshot.role,
    created_at: snapshot.created_at,
    counts: snapshot.counts,
  };
}

export function redactProviderOrgPurgeSnapshot(
  snapshot: ProviderOrgPurgeSnapshot,
): ProviderOrgPurgeSnapshotRedacted {
  return {
    schema_version: 3,
    provider_id: snapshot.provider_id,
    business_name: snapshot.business_name,
    slug: snapshot.slug,
    provider_email_hash: hashEmailForComplianceSnapshot(snapshot.provider_email),
    provider_billing_email_hash: hashEmailForComplianceSnapshot(snapshot.provider_billing_email),
    owner_user_id: snapshot.owner_user_id,
    owner_email_hash: hashEmailForComplianceSnapshot(snapshot.owner_email),
    tenant_id: snapshot.tenant_id,
    stats: snapshot.stats,
    staff_login_user_ids: snapshot.staff_login_user_ids,
  };
}
