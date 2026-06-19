/** Self-service account deletion grace period and compliance retention defaults. */

export const ACCOUNT_DELETION_GRACE_DAYS = 30;

export const COMPLIANCE_SNAPSHOT_RETENTION_YEARS = (() => {
  const raw = process.env.COMPLIANCE_SNAPSHOT_RETENTION_YEARS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 5;
  return Number.isFinite(n) && n >= 1 ? n : 5;
})();

/** When true, delete-account schedules purge after grace days instead of immediate erasure. */
export function isAccountDeletionGraceEnabled(): boolean {
  const v = process.env.ACCOUNT_DELETION_GRACE_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function accountDeletionPurgeAfterDate(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + ACCOUNT_DELETION_GRACE_DAYS);
  return d;
}

export function complianceSnapshotPurgeAfterDate(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setUTCFullYear(d.getUTCFullYear() + COMPLIANCE_SNAPSHOT_RETENTION_YEARS);
  return d;
}
