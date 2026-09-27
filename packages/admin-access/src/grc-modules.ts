/**
 * Config for GRC record modules, shared by the admin UI (tables and forms) and the API
 * (field whitelist + validation). Workflow state changes (approve, accept, close, decide,
 * publish) are not fields here; they go through /api/admin/grc/actions.
 */
import type { GrcPermissionKey } from "./grc";

export type GrcFieldType =
  | "text"
  | "textarea"
  | "markdown"
  | "number"
  | "date"
  | "datetime"
  | "boolean"
  | "select"
  | "user"
  | "ref";

export type GrcFieldOption = { value: string; label: string };

export type GrcField = {
  key: string;
  label: string;
  type: GrcFieldType;
  required?: boolean;
  options?: readonly GrcFieldOption[];
  /** For type "ref": module key whose records are the options. */
  ref?: GrcModuleKey;
  min?: number;
  max?: number;
  maxLength?: number;
  pattern?: string;
  help?: string;
  /** Only settable on create (e.g. ids). */
  createOnly?: boolean;
  /** Shown in forms but never sent (derived by the database). */
  readOnly?: boolean;
};

export type GrcColumn = {
  key: string;
  label: string;
  format?: "date" | "datetime" | "badge" | "boolean" | "user" | "score";
};

export type GrcModuleConfig = {
  key: GrcModuleKey;
  title: string;
  singular: string;
  description: string;
  table: string;
  /** Primary key column. */
  idColumn: string;
  /** Text primary keys without a DB default must be supplied on create. */
  idOnCreate?: boolean;
  viewPermission: GrcPermissionKey;
  editPermission: GrcPermissionKey | null;
  canCreate: boolean;
  columns: readonly GrcColumn[];
  fields: readonly GrcField[];
  orderBy: { column: string; ascending: boolean };
  /** Column shown as the record label in ref pickers. */
  labelColumn: string;
  searchColumns?: readonly string[];
  statusColumn?: string;
};

const opts = (...values: string[]): GrcFieldOption[] =>
  values.map((value) => ({ value, label: value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) }));

export const GRC_OWNER_TEAMS = opts(
  "management", "security", "risk", "privacy", "it_operations", "architecture", "engineering", "people",
);
const SEVERITY = opts("critical", "high", "medium", "low", "info");
const CRITICALITY = opts("critical", "high", "medium", "low");
const SCORE = { min: 1, max: 5 } as const;

export const GRC_MODULE_KEYS = [
  "controls", "risks", "exceptions", "assets", "vendors", "vendor_assessments", "processing", "dpias", "dsr",
  "findings", "corrective_actions", "incidents", "bcdr_tests", "training", "personnel", "internal_audits",
  "management_reviews", "objectives", "evidence_requests", "documents", "evidence", "access_reviews", "risk_acceptances",
] as const;

export type GrcModuleKey = (typeof GRC_MODULE_KEYS)[number];

export const GRC_MODULES: Record<GrcModuleKey, GrcModuleConfig> = {
  controls: {
    key: "controls", title: "Controls", singular: "control",
    description: "Everything we do to meet ISO 27001, NIST CSF and POPIA/GDPR, with owners, status and evidence.",
    table: "grc_controls", idColumn: "id", idOnCreate: true,
    viewPermission: "grc.controls.view", editPermission: "grc.controls.edit", canCreate: true,
    labelColumn: "title", searchColumns: ["id", "title"], statusColumn: "status",
    orderBy: { column: "id", ascending: true },
    columns: [
      { key: "id", label: "ID" }, { key: "title", label: "Control" }, { key: "owner_team", label: "Team", format: "badge" },
      { key: "status", label: "Status", format: "badge" }, { key: "frequency", label: "Evidence cadence" },
      { key: "last_evidence_at", label: "Last evidence", format: "date" },
    ],
    fields: [
      { key: "id", label: "Control ID", type: "text", required: true, createOnly: true, pattern: "^[A-Z]{2,5}-[0-9]{2,3}$", help: "e.g. OPS-19" },
      { key: "title", label: "Title", type: "text", required: true, maxLength: 200 },
      { key: "description", label: "What the control does", type: "textarea" },
      { key: "owner_team", label: "Owning team", type: "select", options: GRC_OWNER_TEAMS },
      { key: "owner_user_id", label: "Control owner", type: "user" },
      { key: "status", label: "Status", type: "select", required: true, options: opts("not_started", "in_progress", "implemented", "operating", "not_applicable") },
      { key: "frequency", label: "Evidence cadence", type: "select", required: true, options: opts("continuous", "monthly", "quarterly", "semiannual", "annual") },
      { key: "implementation_notes", label: "How it is implemented", type: "textarea" },
      { key: "auditor_note", label: "What auditors will ask", type: "textarea" },
      { key: "example_evidence", label: "Example evidence", type: "textarea" },
      { key: "next_review_at", label: "Next review", type: "date" },
    ],
  },
  risks: {
    key: "risks", title: "Risk register", singular: "risk",
    description: "Risks scored 1–5 for likelihood and impact, before and after controls. Acceptance goes through dual approval above appetite.",
    table: "grc_risks", idColumn: "id",
    viewPermission: "grc.risks.view", editPermission: "grc.risks.edit", canCreate: true,
    labelColumn: "title", searchColumns: ["title"], statusColumn: "status",
    orderBy: { column: "inherent_score", ascending: false },
    columns: [
      { key: "title", label: "Risk" }, { key: "inherent_score", label: "Inherent", format: "score" },
      { key: "residual_score", label: "Residual", format: "score" }, { key: "above_appetite", label: "Above appetite", format: "boolean" },
      { key: "treatment", label: "Treatment", format: "badge" }, { key: "status", label: "Status", format: "badge" },
      { key: "review_due_at", label: "Review due", format: "date" },
    ],
    fields: [
      { key: "title", label: "Risk", type: "text", required: true, maxLength: 200 },
      { key: "description", label: "Scenario (threat, vulnerability, impact)", type: "textarea" },
      { key: "category", label: "Category", type: "select", options: opts("security", "privacy", "availability", "supplier", "fraud", "compliance", "people") },
      { key: "likelihood", label: "Inherent likelihood (1–5)", type: "number", required: true, ...SCORE },
      { key: "impact", label: "Inherent impact (1–5)", type: "number", required: true, ...SCORE },
      { key: "residual_likelihood", label: "Residual likelihood (1–5)", type: "number", ...SCORE },
      { key: "residual_impact", label: "Residual impact (1–5)", type: "number", ...SCORE },
      { key: "treatment", label: "Treatment", type: "select", options: opts("mitigate", "transfer", "avoid", "accept"), help: "Choosing accept still needs the acceptance workflow." },
      { key: "treatment_plan", label: "Treatment plan", type: "textarea" },
      { key: "status", label: "Status", type: "select", required: true, options: opts("open", "treating", "closed"), help: "Accepted is set by the acceptance workflow." },
      { key: "owner_user_id", label: "Risk owner", type: "user" },
      { key: "owner_team", label: "Owning team", type: "select", options: GRC_OWNER_TEAMS },
      { key: "review_due_at", label: "Next review", type: "date" },
    ],
  },
  exceptions: {
    key: "exceptions", title: "Policy exceptions", singular: "exception",
    description: "Approved deviations from policy with compensating controls and a review date.",
    table: "grc_exceptions", idColumn: "id",
    viewPermission: "grc.risks.view", editPermission: "grc.risks.edit", canCreate: true,
    labelColumn: "title", statusColumn: "status", orderBy: { column: "review_date", ascending: true },
    columns: [
      { key: "title", label: "Exception" }, { key: "status", label: "Status", format: "badge" },
      { key: "review_date", label: "Review by", format: "date" }, { key: "owner_user_id", label: "Owner", format: "user" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "description", label: "What deviates from policy and why", type: "textarea", required: true },
      { key: "compensating_controls", label: "Compensating controls", type: "textarea", required: true },
      { key: "review_date", label: "Review by", type: "date", required: true },
      { key: "status", label: "Status", type: "select", required: true, options: opts("active", "expired", "closed") },
      { key: "owner_user_id", label: "Owner", type: "user" },
    ],
  },
  assets: {
    key: "assets", title: "Assets", singular: "asset",
    description: "Systems, data stores, repositories and services in scope, with owners and classification.",
    table: "grc_assets", idColumn: "id",
    viewPermission: "grc.assets.view", editPermission: "grc.assets.edit", canCreate: true,
    labelColumn: "name", searchColumns: ["name"], statusColumn: "status", orderBy: { column: "name", ascending: true },
    columns: [
      { key: "name", label: "Asset" }, { key: "asset_type", label: "Type", format: "badge" },
      { key: "criticality", label: "Criticality", format: "badge" }, { key: "data_classification", label: "Classification", format: "badge" },
      { key: "owner_team", label: "Team" }, { key: "status", label: "Status", format: "badge" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "asset_type", label: "Type", type: "select", required: true, options: opts("application", "datastore", "service", "repository", "infrastructure", "endpoint", "document") },
      { key: "description", label: "Description", type: "textarea" },
      { key: "criticality", label: "Criticality", type: "select", required: true, options: CRITICALITY },
      { key: "data_classification", label: "Data classification", type: "select", options: opts("restricted", "confidential", "internal", "public") },
      { key: "owner_team", label: "Owning team", type: "select", options: GRC_OWNER_TEAMS },
      { key: "owner_user_id", label: "Owner", type: "user" },
      { key: "location", label: "Location / region", type: "text" },
      { key: "status", label: "Status", type: "select", required: true, options: opts("active", "retired") },
    ],
  },
  vendors: {
    key: "vendors", title: "Vendors", singular: "vendor",
    description: "Suppliers that process our data or run production services, with DPA and certification status.",
    table: "grc_vendors", idColumn: "id",
    viewPermission: "grc.vendors.view", editPermission: "grc.vendors.edit", canCreate: true,
    labelColumn: "name", searchColumns: ["name"], statusColumn: "status", orderBy: { column: "name", ascending: true },
    columns: [
      { key: "name", label: "Vendor" }, { key: "service_type", label: "Service" },
      { key: "criticality", label: "Criticality", format: "badge" }, { key: "dpa_status", label: "DPA", format: "badge" },
      { key: "certification_expires_at", label: "Cert expires", format: "date" }, { key: "next_review_at", label: "Next review", format: "date" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "service_type", label: "Service", type: "text" },
      { key: "data_processed", label: "Data processed", type: "textarea" },
      { key: "criticality", label: "Criticality", type: "select", required: true, options: CRITICALITY },
      { key: "dpa_status", label: "DPA / operator agreement", type: "select", options: opts("not_required", "requested", "signed", "expired") },
      { key: "data_location", label: "Data location", type: "text", help: "Needed for POPIA s72 cross-border assessment." },
      { key: "certifications", label: "Certifications (SOC 2, ISO 27001…)", type: "text" },
      { key: "certification_expires_at", label: "Certification expires", type: "date" },
      { key: "last_reviewed_at", label: "Last reviewed", type: "date" },
      { key: "next_review_at", label: "Next review", type: "date" },
      { key: "owner_user_id", label: "Relationship owner", type: "user" },
      { key: "website", label: "Website", type: "text" },
      { key: "status", label: "Status", type: "select", required: true, options: opts("active", "offboarding", "retired") },
    ],
  },
  vendor_assessments: {
    key: "vendor_assessments", title: "Vendor assessments", singular: "assessment",
    description: "Security reviews of suppliers (certification reports, questionnaires).",
    table: "grc_vendor_assessments", idColumn: "id",
    viewPermission: "grc.vendors.view", editPermission: "grc.vendors.edit", canCreate: true,
    labelColumn: "vendor_id", orderBy: { column: "assessed_at", ascending: false },
    columns: [
      { key: "vendor_id", label: "Vendor" }, { key: "assessed_at", label: "Assessed", format: "date" },
      { key: "outcome", label: "Outcome", format: "badge" }, { key: "assessor_user_id", label: "Assessor", format: "user" },
    ],
    fields: [
      { key: "vendor_id", label: "Vendor", type: "ref", ref: "vendors", required: true },
      { key: "assessed_at", label: "Assessed on", type: "date", required: true },
      { key: "outcome", label: "Outcome", type: "select", required: true, options: opts("approved", "approved_with_conditions", "rejected") },
      { key: "notes", label: "Notes (reports reviewed, gaps, conditions)", type: "textarea" },
      { key: "assessor_user_id", label: "Assessor", type: "user" },
    ],
  },
  processing: {
    key: "processing", title: "Records of processing", singular: "processing activity",
    description: "What personal information we process, why, on what basis, who receives it and how long we keep it (POPIA / GDPR Art. 30).",
    table: "grc_processing_activities", idColumn: "id",
    viewPermission: "grc.privacy.view", editPermission: "grc.privacy.edit", canCreate: true,
    labelColumn: "name", searchColumns: ["name"], statusColumn: "status", orderBy: { column: "name", ascending: true },
    columns: [
      { key: "name", label: "Activity" }, { key: "lawful_basis", label: "Lawful basis" },
      { key: "data_subjects", label: "Data subjects" }, { key: "retention", label: "Retention" }, { key: "status", label: "Status", format: "badge" },
    ],
    fields: [
      { key: "name", label: "Activity", type: "text", required: true },
      { key: "purpose", label: "Purpose", type: "textarea", required: true },
      { key: "lawful_basis", label: "Lawful basis / justification", type: "text", required: true },
      { key: "data_subjects", label: "Data subjects", type: "text" },
      { key: "data_categories", label: "Categories of personal information", type: "textarea" },
      { key: "recipients", label: "Recipients / operators", type: "textarea" },
      { key: "cross_border_transfers", label: "Cross-border transfers", type: "textarea" },
      { key: "retention", label: "Retention", type: "text" },
      { key: "security_measures", label: "Security measures", type: "textarea" },
      { key: "owner_user_id", label: "Owner", type: "user" },
      { key: "status", label: "Status", type: "select", required: true, options: opts("active", "retired") },
    ],
  },
  dpias: {
    key: "dpias", title: "Impact assessments (PIA/DPIA)", singular: "impact assessment",
    description: "Assessments of high-risk processing before launch.",
    table: "grc_dpias", idColumn: "id",
    viewPermission: "grc.privacy.view", editPermission: "grc.privacy.edit", canCreate: true,
    labelColumn: "summary", statusColumn: "status", orderBy: { column: "completed_at", ascending: false },
    columns: [
      { key: "processing_activity_id", label: "Processing activity" }, { key: "status", label: "Status", format: "badge" },
      { key: "completed_at", label: "Completed", format: "date" }, { key: "owner_user_id", label: "Owner", format: "user" },
    ],
    fields: [
      { key: "processing_activity_id", label: "Processing activity", type: "ref", ref: "processing", required: true },
      { key: "status", label: "Status", type: "select", required: true, options: opts("draft", "in_review", "completed") },
      { key: "summary", label: "Summary: risks, mitigations, residual risk", type: "markdown" },
      { key: "completed_at", label: "Completed on", type: "date" },
      { key: "owner_user_id", label: "Owner", type: "user" },
    ],
  },
  dsr: {
    key: "dsr", title: "Data subject requests", singular: "request",
    description: "Access, correction, deletion and objection requests, with identity check and due date.",
    table: "grc_data_subject_requests", idColumn: "id",
    viewPermission: "grc.privacy.view", editPermission: "grc.privacy.edit", canCreate: true,
    labelColumn: "reference", statusColumn: "status", orderBy: { column: "received_at", ascending: false },
    columns: [
      { key: "reference", label: "Reference" }, { key: "request_type", label: "Type", format: "badge" },
      { key: "received_at", label: "Received", format: "date" }, { key: "due_at", label: "Due", format: "date" },
      { key: "status", label: "Status", format: "badge" }, { key: "identity_verified", label: "ID verified", format: "boolean" },
    ],
    fields: [
      { key: "reference", label: "Reference", type: "text", required: true, help: "Ticket or email reference — don't enter the person's details here." },
      { key: "request_type", label: "Type", type: "select", required: true, options: opts("access", "correction", "deletion", "objection", "portability", "other") },
      { key: "channel", label: "Received via", type: "select", options: opts("email", "in_app", "support_ticket", "paia_form", "other") },
      { key: "received_at", label: "Received", type: "datetime", required: true },
      { key: "due_at", label: "Due", type: "datetime", help: "Defaults to received date + response target in settings." },
      { key: "identity_verified", label: "Identity verified", type: "boolean" },
      { key: "status", label: "Status", type: "select", required: true, options: opts("open", "in_progress", "closed", "rejected") },
      { key: "owner_user_id", label: "Handler", type: "user" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  findings: {
    key: "findings", title: "Findings", singular: "finding",
    description: "Issues from audits, pentests, access reviews, incidents and scanners, tracked to closure with severity-based due dates.",
    table: "grc_findings", idColumn: "id",
    viewPermission: "grc.findings.view", editPermission: "grc.findings.edit", canCreate: true,
    labelColumn: "title", searchColumns: ["title", "external_ref"], statusColumn: "status",
    orderBy: { column: "due_at", ascending: true },
    columns: [
      { key: "title", label: "Finding" }, { key: "severity", label: "Severity", format: "badge" },
      { key: "source", label: "Source", format: "badge" }, { key: "status", label: "Status", format: "badge" },
      { key: "due_at", label: "Due", format: "date" }, { key: "owner_user_id", label: "Owner", format: "user" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text", required: true, maxLength: 300 },
      { key: "description", label: "Description and recommendation", type: "markdown" },
      { key: "severity", label: "Severity", type: "select", required: true, options: SEVERITY },
      { key: "source", label: "Source", type: "select", required: true, options: opts("pentest", "vulnerability_scan", "bug_bounty", "internal_audit", "external_audit", "dependabot", "access_review", "incident", "self_identified") },
      { key: "external_ref", label: "External reference", type: "text", help: "Pentest finding id, ticket number…" },
      { key: "status", label: "Status", type: "select", required: true, options: opts("open", "in_progress", "risk_accepted"), help: "Closing needs the Close action (and retest evidence for high/critical)." },
      { key: "control_id", label: "Related control", type: "ref", ref: "controls" },
      { key: "asset_id", label: "Affected asset", type: "ref", ref: "assets" },
      { key: "owner_user_id", label: "Owner", type: "user" },
      { key: "due_at", label: "Due", type: "datetime", help: "Defaults from severity SLA in settings." },
    ],
  },
  corrective_actions: {
    key: "corrective_actions", title: "Corrective actions", singular: "corrective action",
    description: "Actions that fix the root cause of findings and nonconformities (ISO 27001 clause 10.2).",
    table: "grc_corrective_actions", idColumn: "id",
    viewPermission: "grc.findings.view", editPermission: "grc.findings.edit", canCreate: true,
    labelColumn: "title", statusColumn: "status", orderBy: { column: "due_at", ascending: true },
    columns: [
      { key: "title", label: "Action" }, { key: "status", label: "Status", format: "badge" },
      { key: "due_at", label: "Due", format: "date" }, { key: "owner_user_id", label: "Owner", format: "user" },
    ],
    fields: [
      { key: "finding_id", label: "Finding", type: "ref", ref: "findings", required: true },
      { key: "title", label: "Action", type: "text", required: true },
      { key: "status", label: "Status", type: "select", required: true, options: opts("open", "in_progress", "done") },
      { key: "owner_user_id", label: "Owner", type: "user" },
      { key: "due_at", label: "Due", type: "date" },
      { key: "completed_at", label: "Completed", type: "date" },
    ],
  },
  incidents: {
    key: "incidents", title: "Incidents", singular: "incident",
    description: "Security incidents and personal data breaches with containment, notification and lessons learned.",
    table: "grc_incidents", idColumn: "id",
    viewPermission: "grc.incidents.view", editPermission: "grc.incidents.edit", canCreate: true,
    labelColumn: "title", statusColumn: "status", orderBy: { column: "detected_at", ascending: false },
    columns: [
      { key: "title", label: "Incident" }, { key: "severity", label: "Severity", format: "badge" },
      { key: "status", label: "Status", format: "badge" }, { key: "is_breach", label: "Personal data breach", format: "boolean" },
      { key: "detected_at", label: "Detected", format: "datetime" }, { key: "regulator_notified_at", label: "Regulator notified", format: "datetime" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "summary", label: "What happened", type: "markdown" },
      { key: "severity", label: "Severity", type: "select", required: true, options: opts("critical", "high", "medium", "low") },
      { key: "status", label: "Status", type: "select", required: true, options: opts("open", "contained", "resolved", "closed") },
      { key: "is_breach", label: "Personal data compromised (POPIA s22)", type: "boolean" },
      { key: "detected_at", label: "Detected", type: "datetime", required: true },
      { key: "contained_at", label: "Contained", type: "datetime" },
      { key: "resolved_at", label: "Resolved", type: "datetime" },
      { key: "regulator_notified_at", label: "Information Regulator notified", type: "datetime" },
      { key: "data_subjects_notified_at", label: "Data subjects notified", type: "datetime" },
      { key: "owner_user_id", label: "Incident lead", type: "user" },
      { key: "root_cause", label: "Root cause", type: "textarea" },
      { key: "lessons_learned", label: "Lessons learned", type: "textarea" },
    ],
  },
  bcdr_tests: {
    key: "bcdr_tests", title: "Continuity and DR tests", singular: "test",
    description: "Backup restores, failovers and tabletop exercises with achieved recovery times.",
    table: "grc_bcdr_tests", idColumn: "id",
    viewPermission: "grc.incidents.view", editPermission: "grc.incidents.edit", canCreate: true,
    labelColumn: "test_type", orderBy: { column: "conducted_at", ascending: false },
    columns: [
      { key: "test_type", label: "Test", format: "badge" }, { key: "conducted_at", label: "Date", format: "date" },
      { key: "outcome", label: "Outcome", format: "badge" }, { key: "rto_target_minutes", label: "RTO target (min)" },
      { key: "rto_actual_minutes", label: "RTO achieved (min)" },
    ],
    fields: [
      { key: "test_type", label: "Test type", type: "select", required: true, options: opts("backup_restore", "failover", "tabletop", "incident_simulation", "other") },
      { key: "conducted_at", label: "Date", type: "date", required: true },
      { key: "outcome", label: "Outcome", type: "select", required: true, options: opts("pass", "partial", "fail") },
      { key: "rto_target_minutes", label: "RTO target (minutes)", type: "number", min: 0 },
      { key: "rto_actual_minutes", label: "RTO achieved (minutes)", type: "number", min: 0 },
      { key: "rpo_target_minutes", label: "RPO target (minutes)", type: "number", min: 0 },
      { key: "notes", label: "Notes and follow-ups", type: "textarea" },
      { key: "owner_user_id", label: "Owner", type: "user" },
    ],
  },
  training: {
    key: "training", title: "Training records", singular: "training record",
    description: "Security and privacy awareness completions with expiry.",
    table: "grc_training_records", idColumn: "id",
    viewPermission: "grc.people.view", editPermission: "grc.people.edit", canCreate: true,
    labelColumn: "course_key", orderBy: { column: "completed_at", ascending: false },
    columns: [
      { key: "user_id", label: "Person", format: "user" }, { key: "course_key", label: "Course" },
      { key: "completed_at", label: "Completed", format: "date" }, { key: "expires_at", label: "Expires", format: "date" },
    ],
    fields: [
      { key: "user_id", label: "Person", type: "user", required: true },
      { key: "course_key", label: "Course", type: "select", required: true, options: opts("security_awareness", "popia_privacy", "phishing", "secure_coding", "incident_response", "other") },
      { key: "completed_at", label: "Completed", type: "date", required: true },
      { key: "expires_at", label: "Expires", type: "date" },
    ],
  },
  personnel: {
    key: "personnel", title: "Joiners, movers and leavers", singular: "personnel event",
    description: "Access changes when people join, change role or leave. Auditors compare leave date with access removal.",
    table: "grc_personnel_events", idColumn: "id",
    viewPermission: "grc.people.view", editPermission: "grc.people.edit", canCreate: true,
    labelColumn: "event_type", orderBy: { column: "event_at", ascending: false },
    columns: [
      { key: "user_id", label: "Person", format: "user" }, { key: "event_type", label: "Event", format: "badge" },
      { key: "event_at", label: "Date", format: "date" }, { key: "access_removed_at", label: "Access removed", format: "datetime" },
      { key: "checklist_completed", label: "Checklist done", format: "boolean" },
    ],
    fields: [
      { key: "user_id", label: "Person", type: "user", required: true },
      { key: "event_type", label: "Event", type: "select", required: true, options: opts("joiner", "mover", "leaver") },
      { key: "event_at", label: "Effective date", type: "date", required: true },
      { key: "access_removed_at", label: "Access removed at (leavers)", type: "datetime" },
      { key: "checklist_completed", label: "Checklist completed", type: "boolean" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  internal_audits: {
    key: "internal_audits", title: "Internal audits", singular: "internal audit",
    description: "ISO 27001 clause 9.2 audit programme.",
    table: "grc_internal_audits", idColumn: "id",
    viewPermission: "grc.audits.view", editPermission: "grc.audits.edit", canCreate: true,
    labelColumn: "title", statusColumn: "status", orderBy: { column: "conducted_at", ascending: false },
    columns: [
      { key: "title", label: "Audit" }, { key: "status", label: "Status", format: "badge" },
      { key: "conducted_at", label: "Conducted", format: "date" }, { key: "lead_user_id", label: "Lead auditor", format: "user" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "scope", label: "Scope (clauses, controls, teams)", type: "textarea" },
      { key: "status", label: "Status", type: "select", required: true, options: opts("planned", "in_progress", "completed") },
      { key: "conducted_at", label: "Conducted", type: "date" },
      { key: "completed_at", label: "Report issued", type: "date" },
      { key: "lead_user_id", label: "Lead auditor (independent of the area)", type: "user" },
      { key: "report_markdown", label: "Report", type: "markdown" },
    ],
  },
  management_reviews: {
    key: "management_reviews", title: "Management reviews", singular: "management review",
    description: "Top-management review of the ISMS (clause 9.3). Signed off by a management approver who didn't record the minutes.",
    table: "grc_management_reviews", idColumn: "id",
    viewPermission: "grc.audits.view", editPermission: "grc.audits.edit", canCreate: true,
    labelColumn: "review_date", statusColumn: "status", orderBy: { column: "review_date", ascending: false },
    columns: [
      { key: "review_date", label: "Date", format: "date" }, { key: "status", label: "Status", format: "badge" },
      { key: "approved_by", label: "Signed off by", format: "user" }, { key: "approved_at", label: "Signed off", format: "date" },
    ],
    fields: [
      { key: "review_date", label: "Review date", type: "date", required: true },
      { key: "attendees", label: "Attendees", type: "text" },
      { key: "minutes_markdown", label: "Minutes", type: "markdown", help: "Cover: previous actions, changes in context, performance (nonconformities, monitoring, audits, objectives), interested-party feedback, risk results, improvement opportunities." },
      { key: "decisions_markdown", label: "Decisions and actions", type: "markdown" },
    ],
  },
  objectives: {
    key: "objectives", title: "Security objectives", singular: "objective",
    description: "Measurable security objectives (clause 6.2).",
    table: "grc_objectives", idColumn: "id",
    viewPermission: "grc.audits.view", editPermission: "grc.audits.edit", canCreate: true,
    labelColumn: "title", statusColumn: "status", orderBy: { column: "due_date", ascending: true },
    columns: [
      { key: "title", label: "Objective" }, { key: "target_metric", label: "Target" }, { key: "current_value", label: "Current" },
      { key: "status", label: "Status", format: "badge" }, { key: "due_date", label: "Due", format: "date" },
    ],
    fields: [
      { key: "title", label: "Objective", type: "text", required: true },
      { key: "target_metric", label: "Target (measurable)", type: "text", required: true },
      { key: "current_value", label: "Current value", type: "text" },
      { key: "status", label: "Status", type: "select", required: true, options: opts("active", "achieved", "missed", "retired") },
      { key: "due_date", label: "Due", type: "date" },
      { key: "owner_user_id", label: "Owner", type: "user" },
    ],
  },
  evidence_requests: {
    key: "evidence_requests", title: "Evidence requests", singular: "evidence request",
    description: "Evidence owners must upload, raised automatically on each control's cadence or manually.",
    table: "grc_evidence_requests", idColumn: "id",
    viewPermission: "grc.evidence.view", editPermission: "grc.controls.edit", canCreate: true,
    labelColumn: "title", statusColumn: "status", orderBy: { column: "due_at", ascending: true },
    columns: [
      { key: "control_id", label: "Control" }, { key: "title", label: "Request" },
      { key: "assignee_user_id", label: "Assignee", format: "user" }, { key: "due_at", label: "Due", format: "date" },
      { key: "status", label: "Status", format: "badge" },
    ],
    fields: [
      { key: "control_id", label: "Control", type: "ref", ref: "controls", required: true },
      { key: "title", label: "What is needed", type: "text", required: true },
      { key: "assignee_user_id", label: "Assignee", type: "user" },
      { key: "due_at", label: "Due", type: "datetime", required: true },
      { key: "status", label: "Status", type: "select", required: true, options: opts("open", "cancelled") },
    ],
  },
  documents: {
    key: "documents", title: "Policies and documents", singular: "document",
    description: "Versioned policies, standards and plans. Approval by someone other than the author; staff acknowledge approved versions.",
    table: "grc_documents", idColumn: "id",
    viewPermission: "grc.documents.view", editPermission: "grc.documents.edit", canCreate: false,
    labelColumn: "title", searchColumns: ["title", "slug"], statusColumn: "status", orderBy: { column: "title", ascending: true },
    columns: [
      { key: "title", label: "Document" }, { key: "doc_type", label: "Type", format: "badge" },
      { key: "status", label: "Status", format: "badge" }, { key: "owner_user_id", label: "Owner", format: "user" },
      { key: "next_review_at", label: "Next review", format: "date" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "owner_user_id", label: "Owner", type: "user" },
      { key: "requires_acknowledgement", label: "Staff must acknowledge", type: "boolean" },
      { key: "next_review_at", label: "Next review", type: "date" },
    ],
  },
  evidence: {
    key: "evidence", title: "Evidence locker", singular: "evidence item",
    description: "Hashed, append-only evidence. Uploads are verified against their SHA-256; reviews are recorded separately.",
    table: "grc_evidence_current", idColumn: "id",
    viewPermission: "grc.evidence.view", editPermission: null, canCreate: false,
    labelColumn: "title", statusColumn: "review_status", orderBy: { column: "created_at", ascending: false },
    columns: [
      { key: "control_id", label: "Control" }, { key: "title", label: "Evidence" }, { key: "source", label: "Source", format: "badge" },
      { key: "review_status", label: "Review", format: "badge" }, { key: "submitted_by", label: "Submitted by", format: "user" },
      { key: "created_at", label: "Submitted", format: "datetime" },
    ],
    fields: [],
  },
  access_reviews: {
    key: "access_reviews", title: "Access reviews", singular: "access review",
    description: "Quarterly review of every admin user and GRC role. Nobody decides on their own access.",
    table: "grc_access_reviews", idColumn: "id",
    viewPermission: "grc.access_reviews.view", editPermission: null, canCreate: false,
    labelColumn: "title", statusColumn: "status", orderBy: { column: "created_at", ascending: false },
    columns: [
      { key: "title", label: "Review" }, { key: "period_start", label: "From", format: "date" },
      { key: "period_end", label: "To", format: "date" }, { key: "status", label: "Status", format: "badge" },
      { key: "completed_at", label: "Completed", format: "date" },
    ],
    fields: [],
  },
  risk_acceptances: {
    key: "risk_acceptances", title: "Risk acceptances", singular: "risk acceptance",
    description: "Proposed and decided acceptances with proposer, approver and expiry.",
    table: "grc_risk_acceptances", idColumn: "id",
    viewPermission: "grc.risks.view", editPermission: null, canCreate: false,
    labelColumn: "risk_id", statusColumn: "status", orderBy: { column: "proposed_at", ascending: false },
    columns: [
      { key: "risk_id", label: "Risk" }, { key: "status", label: "Status", format: "badge" },
      { key: "risk_manager_id", label: "Proposed by", format: "user" }, { key: "management_approver_id", label: "Decided by", format: "user" },
      { key: "expires_at", label: "Expires", format: "date" },
    ],
    fields: [],
  },
};

export function getGrcModule(key: string): GrcModuleConfig | null {
  return (GRC_MODULE_KEYS as readonly string[]).includes(key) ? GRC_MODULES[key as GrcModuleKey] : null;
}
