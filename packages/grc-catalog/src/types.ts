export type CatalogFramework = { id: string; name: string; version: string; description: string };

export type RequirementCategory = "clause" | "annex_a" | "category" | "condition" | "section" | "article";

export type CatalogRequirement = {
  /** `${framework_id}:${ref_code}`, e.g. `iso27001:A.5.15`. */
  id: string;
  framework_id: string;
  ref_code: string;
  title: string;
  description: string;
  category: RequirementCategory;
  sort_order: number;
};

export type OwnerTeam =
  | "management"
  | "security"
  | "risk"
  | "privacy"
  | "it_operations"
  | "architecture"
  | "engineering"
  | "people";

export type ControlFrequency = "continuous" | "monthly" | "quarterly" | "semiannual" | "annual";
export type ControlStatus = "not_started" | "in_progress" | "implemented" | "operating" | "not_applicable";

export type CatalogControl = {
  id: string;
  title: string;
  description: string;
  owner_team: OwnerTeam;
  frequency: ControlFrequency;
  /** Seed status. `implemented` only where the repository demonstrably enforces the control. */
  status: ControlStatus;
  collector_key: string | null;
  implementation_notes: string;
  auditor_note: string;
  example_evidence: string;
  /** Requirement ids (see CatalogRequirement.id). */
  requirement_ids: string[];
};

export type CatalogDocument = {
  slug: string;
  title: string;
  doc_type: "policy" | "standard" | "procedure" | "plan" | "statement";
  /** File name under packages/grc-catalog/policies/. */
  file: string;
  requires_acknowledgement: boolean;
};

export type CatalogVendor = {
  id: string;
  name: string;
  service_type: string;
  data_processed: string;
  criticality: "critical" | "high" | "medium" | "low";
  website: string;
};

export type CatalogAsset = {
  id: string;
  name: string;
  asset_type: "application" | "datastore" | "service" | "repository" | "infrastructure";
  description: string;
  owner_team: OwnerTeam;
  criticality: "critical" | "high" | "medium" | "low";
  data_classification: "restricted" | "confidential" | "internal" | "public";
};

export type CatalogProcessingActivity = {
  name: string;
  purpose: string;
  lawful_basis: string;
  data_subjects: string;
  data_categories: string;
  recipients: string;
  cross_border_transfers: string;
  retention: string;
};
