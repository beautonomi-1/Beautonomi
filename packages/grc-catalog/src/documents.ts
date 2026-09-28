import type { CatalogDocument } from "./types";

/** Policy templates. Bodies live in packages/grc-catalog/policies/<file>. */
export const POLICY_TEMPLATES: CatalogDocument[] = [
  { slug: "isms-scope", title: "ISMS Scope Statement", doc_type: "statement", file: "isms-scope.md", requires_acknowledgement: false },
  { slug: "information-security-policy", title: "Information Security Policy", doc_type: "policy", file: "information-security-policy.md", requires_acknowledgement: true },
  { slug: "access-control-policy", title: "Access Control Policy", doc_type: "policy", file: "access-control-policy.md", requires_acknowledgement: true },
  { slug: "acceptable-use-policy", title: "Acceptable Use Policy", doc_type: "policy", file: "acceptable-use-policy.md", requires_acknowledgement: true },
  { slug: "data-classification-standard", title: "Data Classification and Handling Standard", doc_type: "standard", file: "data-classification-standard.md", requires_acknowledgement: true },
  { slug: "risk-management-methodology", title: "Risk Management Methodology", doc_type: "procedure", file: "risk-management-methodology.md", requires_acknowledgement: false },
  { slug: "incident-response-plan", title: "Incident Response Plan", doc_type: "plan", file: "incident-response-plan.md", requires_acknowledgement: false },
  { slug: "business-continuity-dr-plan", title: "Business Continuity and Disaster Recovery Plan", doc_type: "plan", file: "business-continuity-dr-plan.md", requires_acknowledgement: false },
  { slug: "privacy-data-protection-policy", title: "Privacy and Data Protection Policy", doc_type: "policy", file: "privacy-data-protection-policy.md", requires_acknowledgement: true },
  { slug: "supplier-security-policy", title: "Supplier Security Policy", doc_type: "policy", file: "supplier-security-policy.md", requires_acknowledgement: false },
  { slug: "secure-development-policy", title: "Secure Development Policy", doc_type: "policy", file: "secure-development-policy.md", requires_acknowledgement: false },
  { slug: "change-management-procedure", title: "Change Management Procedure", doc_type: "procedure", file: "change-management-procedure.md", requires_acknowledgement: false },
  { slug: "vulnerability-management-standard", title: "Vulnerability Management Standard", doc_type: "standard", file: "vulnerability-management-standard.md", requires_acknowledgement: false },
  { slug: "logging-monitoring-standard", title: "Logging and Monitoring Standard", doc_type: "standard", file: "logging-monitoring-standard.md", requires_acknowledgement: false },
  { slug: "cryptography-standard", title: "Cryptography Standard", doc_type: "standard", file: "cryptography-standard.md", requires_acknowledgement: false },
  { slug: "backup-recovery-standard", title: "Backup and Recovery Standard", doc_type: "standard", file: "backup-recovery-standard.md", requires_acknowledgement: false },
  { slug: "data-retention-schedule", title: "Data Retention and Deletion Schedule", doc_type: "standard", file: "data-retention-schedule.md", requires_acknowledgement: false },
  { slug: "remote-working-policy", title: "Remote Working Policy", doc_type: "policy", file: "remote-working-policy.md", requires_acknowledgement: true },
];
