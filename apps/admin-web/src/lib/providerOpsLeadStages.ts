/**
 * Shared Provider Ops lead stage metadata for the admin SPA.
 *
 * Keep this in the same order as the web API's provider lead validation:
 * `apps/web/src/lib/provider-ops/lead-pipeline-stages.ts`.
 */
export const LEAD_STAGE_KEYS = [
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

export type LeadStageKey = (typeof LEAD_STAGE_KEYS)[number];

export const LEAD_STAGE_FILTERS = ["all", ...LEAD_STAGE_KEYS] as const;

export const LEAD_STAGE_LABELS: Record<LeadStageKey | "all", string> = {
  all: "All",
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal_sent: "Proposal sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
  nurture: "Nurture",
  matched: "Matched",
};

export const LEAD_STAGE_DESCRIPTIONS: Record<LeadStageKey, string> = {
  new: "Fresh lead, not yet contacted.",
  contacted: "First outreach sent or call made.",
  qualified: "Fit confirmed and commercial interest exists.",
  proposal_sent: "Proposal, package, or pricing has been shared.",
  negotiating: "Commercial terms are being discussed.",
  won: "Lead agreed to join. Ready to convert or invite.",
  lost: "Lead declined or is not a fit.",
  nurture: "Not ready now. Keep warm for later follow-up.",
  matched: "Lead has been linked to a provider account.",
};

export const LEAD_STAGE_NEXT_ACTIONS: Record<LeadStageKey, string> = {
  new: "Contact the lead.",
  contacted: "Qualify fit and category.",
  qualified: "Send proposal or onboarding invite.",
  proposal_sent: "Follow up and negotiate.",
  negotiating: "Move to won, lost, or nurture.",
  won: "Convert to provider or send onboarding link.",
  lost: "Record why and stop active follow-up.",
  nurture: "Schedule future follow-up.",
  matched: "Track provider activation.",
};

export const LEAD_STAGE_BADGE: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 ring-blue-600/20",
  contacted: "bg-cyan-100 text-cyan-700 ring-cyan-600/20",
  qualified: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  proposal_sent: "bg-violet-100 text-violet-700 ring-violet-600/20",
  negotiating: "bg-purple-100 text-purple-700 ring-purple-600/20",
  won: "bg-green-100 text-green-700 ring-green-600/20",
  lost: "bg-red-100 text-red-700 ring-red-600/20",
  nurture: "bg-amber-100 text-amber-700 ring-amber-600/20",
  matched: "bg-teal-100 text-teal-700 ring-teal-600/20",
};

export const LEAD_STAGE_DOT: Record<string, string> = {
  new: "bg-blue-500",
  contacted: "bg-cyan-500",
  qualified: "bg-emerald-500",
  proposal_sent: "bg-violet-500",
  negotiating: "bg-purple-500",
  won: "bg-green-500",
  lost: "bg-red-500",
  nurture: "bg-amber-500",
  matched: "bg-teal-500",
};

export const LEAD_STAGE_COLUMN_COLOR: Record<LeadStageKey, string> = {
  new: "border-blue-300 bg-blue-50",
  contacted: "border-cyan-300 bg-cyan-50",
  qualified: "border-emerald-300 bg-emerald-50",
  proposal_sent: "border-violet-300 bg-violet-50",
  negotiating: "border-purple-300 bg-purple-50",
  won: "border-green-300 bg-green-50",
  lost: "border-red-300 bg-red-50",
  nurture: "border-amber-300 bg-amber-50",
  matched: "border-teal-300 bg-teal-50",
};

export const LEAD_STAGE_HEADER_BG: Record<LeadStageKey, string> = {
  new: "bg-blue-500",
  contacted: "bg-cyan-500",
  qualified: "bg-emerald-500",
  proposal_sent: "bg-violet-500",
  negotiating: "bg-purple-500",
  won: "bg-green-500",
  lost: "bg-red-500",
  nurture: "bg-amber-500",
  matched: "bg-teal-500",
};

export const LEAD_STAGE_OPTIONS = LEAD_STAGE_KEYS.map((key) => ({
  key,
  label: LEAD_STAGE_LABELS[key],
  description: LEAD_STAGE_DESCRIPTIONS[key],
  nextAction: LEAD_STAGE_NEXT_ACTIONS[key],
  color: LEAD_STAGE_COLUMN_COLOR[key],
  headerBg: LEAD_STAGE_HEADER_BG[key],
  dot: LEAD_STAGE_DOT[key],
}));

export const LEAD_STAGE_PRIMARY_FLOW: LeadStageKey[] = [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "negotiating",
  "won",
  "matched",
];

export const LEAD_STAGE_BRANCHES: LeadStageKey[] = ["lost", "nurture"];

export function getLeadStageLabel(stage: string | null | undefined): string {
  if (!stage) return "Unknown";
  return LEAD_STAGE_LABELS[stage as LeadStageKey] ?? stage.replace(/_/g, " ");
}

export function getLeadStageDescription(stage: string | null | undefined): string {
  if (!stage) return "No stage set.";
  return LEAD_STAGE_DESCRIPTIONS[stage as LeadStageKey] ?? "Custom or unknown stage.";
}

export function getLeadStageNextAction(stage: string | null | undefined): string {
  if (!stage) return "Choose a stage.";
  return LEAD_STAGE_NEXT_ACTIONS[stage as LeadStageKey] ?? "Review this lead.";
}
