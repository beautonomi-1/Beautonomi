export type FeatureFieldType = "toggle" | "limit" | "multiselect" | "text";

export type FeatureFieldOption = {
  value: string;
  label: string;
};

export type FeatureFieldDef = {
  key: string;
  label: string;
  description?: string;
  type: FeatureFieldType;
  /** Multiselect option list */
  options?: FeatureFieldOption[];
  freePlanDefault: unknown;
  generousDefault?: unknown;
};

export type FeatureCategoryDef = {
  key: string;
  label: string;
  description: string;
  group: "core" | "marketing" | "payments" | "operations" | "analytics" | "integrations";
  fields: FeatureFieldDef[];
};

export type FeatureCategoryBlob = {
  enabled?: boolean;
  channels?: string[];
  providers?: string[];
  report_types?: string[];
  note?: string;
} & Record<string, unknown>;

export type PlanFeaturesMap = Record<string, FeatureCategoryBlob>;

export type PlanScalarLimits = {
  max_bookings_per_month: number | null;
  max_staff_members: number | null;
  max_locations: number;
};
