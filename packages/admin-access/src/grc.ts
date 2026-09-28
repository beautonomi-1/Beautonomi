/**
 * GRC permission matrix. The SQL seed in the latest GRC migration is generated from this file:
 * `node scripts/generate-grc-rbac-seed.mjs` (after `pnpm --filter @beautonomi/admin-access build`).
 */

export const GRC_HUB_FEATURE_FLAG = "grc_hub_enabled" as const;

export const GRC_ROLES = [
  "grc_admin",
  "security_lead",
  "risk_manager",
  "privacy_officer",
  "it_operations",
  "architecture",
  "management_approver",
  "contributor",
  "viewer",
] as const;

export type GrcRole = (typeof GRC_ROLES)[number];

export const GRC_ROLE_LABELS: Record<GrcRole, string> = {
  grc_admin: "ISMS manager (GRC admin)",
  security_lead: "Security lead",
  risk_manager: "Risk manager",
  privacy_officer: "Privacy / Information Officer",
  it_operations: "IT operations",
  architecture: "Architecture",
  management_approver: "Management approver",
  contributor: "Control owner (contributor)",
  viewer: "Viewer (read-only)",
};

export const GRC_PERMISSION_KEYS = [
  "grc.overview.view",
  "grc.controls.view",
  "grc.controls.edit",
  "grc.documents.view",
  "grc.documents.edit",
  "grc.documents.approve",
  "grc.risks.view",
  "grc.risks.edit",
  "grc.risks.accept",
  "grc.assets.view",
  "grc.assets.edit",
  "grc.vendors.view",
  "grc.vendors.edit",
  "grc.privacy.view",
  "grc.privacy.edit",
  "grc.evidence.view",
  "grc.evidence.submit",
  "grc.evidence.review",
  "grc.access_reviews.view",
  "grc.access_reviews.decide",
  "grc.findings.view",
  "grc.findings.edit",
  "grc.findings.close",
  "grc.incidents.view",
  "grc.incidents.edit",
  "grc.people.view",
  "grc.people.edit",
  "grc.audits.view",
  "grc.audits.edit",
  "grc.audit_packs.generate",
  "grc.settings.manage",
  "grc.assignments.manage",
] as const;

export type GrcPermissionKey = (typeof GRC_PERMISSION_KEYS)[number];

const ALL: readonly GrcPermissionKey[] = GRC_PERMISSION_KEYS;

const VIEW_ONLY: readonly GrcPermissionKey[] = GRC_PERMISSION_KEYS.filter((k) => k.endsWith(".view"));

/** Permission keys granted to each GRC role (union when a user holds multiple roles). */
export const GRC_ROLE_PERMISSIONS: Record<GrcRole, readonly GrcPermissionKey[]> = {
  grc_admin: ALL,
  security_lead: [
    "grc.overview.view",
    "grc.controls.view",
    "grc.controls.edit",
    "grc.documents.view",
    "grc.documents.edit",
    "grc.documents.approve",
    "grc.risks.view",
    "grc.assets.view",
    "grc.vendors.view",
    "grc.evidence.view",
    "grc.evidence.review",
    "grc.access_reviews.view",
    "grc.findings.view",
    "grc.findings.edit",
    "grc.findings.close",
    "grc.incidents.view",
    "grc.incidents.edit",
    "grc.people.view",
    "grc.audits.view",
  ],
  risk_manager: [
    "grc.overview.view",
    "grc.controls.view",
    "grc.documents.view",
    "grc.risks.view",
    "grc.risks.edit",
    "grc.risks.accept",
    "grc.assets.view",
    "grc.vendors.view",
    "grc.vendors.edit",
    "grc.evidence.view",
    "grc.findings.view",
    "grc.incidents.view",
    "grc.audits.view",
    "grc.audits.edit",
  ],
  privacy_officer: [
    "grc.overview.view",
    "grc.controls.view",
    "grc.documents.view",
    "grc.privacy.view",
    "grc.privacy.edit",
    "grc.assets.view",
    "grc.vendors.view",
    "grc.evidence.view",
    "grc.evidence.submit",
    "grc.findings.view",
    "grc.incidents.view",
    "grc.incidents.edit",
  ],
  it_operations: [
    "grc.overview.view",
    "grc.controls.view",
    "grc.documents.view",
    "grc.assets.view",
    "grc.assets.edit",
    "grc.evidence.view",
    "grc.evidence.submit",
    "grc.access_reviews.view",
    "grc.access_reviews.decide",
    "grc.findings.view",
    "grc.findings.edit",
    "grc.incidents.view",
    "grc.incidents.edit",
    "grc.people.view",
    "grc.people.edit",
  ],
  architecture: [
    "grc.overview.view",
    "grc.controls.view",
    "grc.documents.view",
    "grc.risks.view",
    "grc.assets.view",
    "grc.assets.edit",
    "grc.evidence.view",
    "grc.evidence.submit",
    "grc.findings.view",
    "grc.findings.edit",
  ],
  management_approver: [
    ...VIEW_ONLY,
    "grc.documents.approve",
    "grc.risks.accept",
    "grc.audits.edit",
  ],
  contributor: [
    "grc.overview.view",
    "grc.controls.view",
    "grc.documents.view",
    "grc.evidence.view",
    "grc.evidence.submit",
  ],
  viewer: VIEW_ONLY,
};

/**
 * Superadmins without a GRC role can read everything and administer assignments/settings,
 * but never approve, review, accept or attest (segregation of duties). Mirrors grc_has_permission().
 */
export function grcSuperadminHasPermission(key: string): boolean {
  return key.endsWith(".view") || key === "grc.assignments.manage" || key === "grc.settings.manage";
}

export function grcRoleHasPermission(role: GrcRole, key: string): boolean {
  const perms = GRC_ROLE_PERMISSIONS[role];
  return perms?.includes(key as GrcPermissionKey) ?? false;
}

export function grcRolesHavePermission(roles: readonly string[], key: string): boolean {
  return roles.some((r) => GRC_ROLES.includes(r as GrcRole) && grcRoleHasPermission(r as GrcRole, key));
}

/** Effective permission keys for a user's GRC roles (plus the superadmin baseline). */
export function grcEffectivePermissions(roles: readonly string[], isSuperadmin: boolean): GrcPermissionKey[] {
  const out = new Set<GrcPermissionKey>();
  for (const r of roles) {
    if (!GRC_ROLES.includes(r as GrcRole)) continue;
    for (const k of GRC_ROLE_PERMISSIONS[r as GrcRole]) out.add(k);
  }
  if (isSuperadmin) {
    for (const k of GRC_PERMISSION_KEYS) if (grcSuperadminHasPermission(k)) out.add(k);
  }
  return Array.from(out);
}

/** Flat seed rows for SQL parity tests: { grc_role, permission_key } */
export function grcPermissionSeedRows(): Array<{ grc_role: GrcRole; permission_key: GrcPermissionKey }> {
  const rows: Array<{ grc_role: GrcRole; permission_key: GrcPermissionKey }> = [];
  for (const grc_role of GRC_ROLES) {
    for (const permission_key of Array.from(new Set(GRC_ROLE_PERMISSIONS[grc_role]))) {
      rows.push({ grc_role, permission_key });
    }
  }
  return rows;
}
