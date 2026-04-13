/** Commercial stages for `provider_leads` — keep in sync with leads API validation. */
export const PROVIDER_LEAD_PIPELINE_STAGES = [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "negotiating",
  "won",
  "lost",
  "nurture",
  "matched",
] as const;
