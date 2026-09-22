import type { OnboardingFormData, OnboardingStepMeta, WizardStepKey, ZoneSuggestStatus } from "./types";

export const DEFAULT_COUNTRY_NAME = "South Africa";

export function hasValidAddressCoords(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export function effectiveZoneSuggestStatus(
  data: Pick<OnboardingFormData, "zone_suggest_status" | "selected_zone_ids">,
): ZoneSuggestStatus | undefined {
  if (data.zone_suggest_status) return data.zone_suggest_status;
  if ((data.selected_zone_ids?.length ?? 0) > 0) return "matched";
  return undefined;
}

const MOBILE_STEP_KEY_TO_ID: Record<WizardStepKey, number> = {
  team_size: 1,
  identity: 2,
  business: 3,
  payment: 4,
  software: 5,
  payroll: 6,
  location: 7,
  photos: 8,
  zones: 9,
  travel_fees: 10,
  categories: 11,
  catalog: 12,
  hours: 13,
  review: 14,
  plan: 15,
};

const MOBILE_STEP_ID_TO_KEY: Array<[WizardStepKey, number]> = [
  ["team_size", 1],
  ["identity", 2],
  ["business", 3],
  ["payment", 4],
  ["software", 5],
  ["payroll", 6],
  ["location", 7],
  ["photos", 8],
  ["zones", 9],
  ["travel_fees", 10],
  ["categories", 11],
  ["catalog", 12],
  ["hours", 13],
  ["review", 14],
  ["plan", 15],
];

export function wizardStepIdForKey(key: WizardStepKey): number {
  return MOBILE_STEP_KEY_TO_ID[key];
}

export function wizardStepKeyForId(stepId: number): WizardStepKey | null {
  for (const [key, id] of MOBILE_STEP_ID_TO_KEY) {
    if (id === stepId) return key;
  }
  return null;
}

export function zoneSuggestInvalidationPatch(
  prevLat: number | null | undefined,
  prevLng: number | null | undefined,
  nextLat: number | null | undefined,
  nextLng: number | null | undefined,
): Pick<OnboardingFormData, "zone_suggest_status" | "selected_zone_ids"> | null {
  if (!hasValidAddressCoords(nextLat, nextLng)) {
    return { zone_suggest_status: undefined, selected_zone_ids: [] };
  }
  if (
    hasValidAddressCoords(prevLat, prevLng) &&
    prevLat === nextLat &&
    prevLng === nextLng
  ) {
    return null;
  }
  return { zone_suggest_status: undefined, selected_zone_ids: [] };
}

export const INITIAL_FORM: OnboardingFormData = {
  owner_name: "",
  owner_email: "",
  email_verified: false,
  owner_phone: "",
  phone_verified: false,
  date_of_birth: "",
  business_name: "",
  business_type: "salon",
  description: "",
  languages_spoken: ["English"],
  social_media_links: {},
  services: [],
  global_category_ids: [],
  provider_categories: [],
  address: {
    line1: "",
    city: "",
    state: "",
    postal_code: "",
    country: DEFAULT_COUNTRY_NAME,
  },
  accepts_custom_requests: true,
  // §provider-launch (2026-06): travel fees collected in-wizard for mobile/both
  // providers. Defaults to the platform standard so skipping keeps prior
  // behavior (auto-seeded platform default on submit).
  travel_fees: { enabled: true, use_platform_default: true },
  operating_hours: {
    monday: { open: "09:00", close: "18:00", closed: false },
    tuesday: { open: "09:00", close: "18:00", closed: false },
    wednesday: { open: "09:00", close: "18:00", closed: false },
    thursday: { open: "09:00", close: "18:00", closed: false },
    friday: { open: "09:00", close: "18:00", closed: false },
    saturday: { open: "09:00", close: "18:00", closed: false },
    sunday: { open: "09:00", close: "18:00", closed: false },
  },
};

export const STEPS: OnboardingStepMeta[] = [
  { id: 1, title: "Team size", description: "Tell us about your team" },
  { id: 2, title: "Your identity", description: "Name, verified email, and verified phone" },
  { id: 3, title: "Business details", description: "How customers see your business" },
  { id: 4, title: "Payment setup", description: "Card machine & VAT" },
  { id: 5, title: "Current software", description: "Optional — previous booking system" },
  {
    id: 6,
    title: "Payroll",
    description: "How you pay staff",
    conditional: (d) => d.team_size !== "freelancer",
  },
  { id: 7, title: "Location", description: "Primary address" },
  { id: 8, title: "Photos", description: "Required thumbnail & profile images" },
  {
    id: 9,
    title: "Service zones",
    description: "Where you offer mobile visits",
    conditional: (d) =>
      (d.business_type === "mobile" || d.business_type === "both") &&
      effectiveZoneSuggestStatus(d) !== "matched",
  },
  {
    id: 10,
    title: "Travel fees",
    description: "Charge for at-home travel",
    canSkip: true,
    conditional: (d) => d.business_type === "mobile" || d.business_type === "both",
  },
  { id: 11, title: "Categories", description: "What you offer" },
  { id: 12, title: "Services", description: "Optional — add services now or later", canSkip: true },
  { id: 13, title: "Hours", description: "When you're available" },
  { id: 14, title: "Review", description: "Check your details" },
  { id: 15, title: "Plan", description: "Choose a subscription" },
];

/** Step id for the Categories step (used in submit validation redirects). */
export const CATEGORIES_STEP_ID =
  STEPS.find((s) => s.title === "Categories")?.id ?? 11;

/** Step id for the Review step (used by "edit from review" jumps). */
export const REVIEW_STEP_ID =
  STEPS.find((s) => s.title === "Review")?.id ?? 14;

export function stepIsVisible(stepId: number, data: Partial<OnboardingFormData>): boolean {
  const meta = STEPS[stepId - 1];
  if (!meta) return false;
  if (meta.conditional && !meta.conditional(data)) return false;
  return true;
}

export function getNextStep(current: number, data: Partial<OnboardingFormData>): number | null {
  let next = current + 1;
  while (next <= STEPS.length) {
    if (stepIsVisible(next, data)) return next;
    next++;
  }
  return null;
}

export function getPreviousStep(current: number, data: Partial<OnboardingFormData>): number | null {
  let prev = current - 1;
  while (prev >= 1) {
    if (stepIsVisible(prev, data)) return prev;
    prev--;
  }
  return null;
}

export function countVisibleSteps(data: Partial<OnboardingFormData>): number {
  return STEPS.filter((s) => stepIsVisible(s.id, data)).length;
}

export function visibleStepIndex(current: number, data: Partial<OnboardingFormData>): number {
  let idx = 0;
  for (const s of STEPS) {
    if (!stepIsVisible(s.id, data)) {
      // When `current` is itself invisible (e.g. business_type toggled mid-flow
      // and the previously selected step is now skipped), surface the index of
      // the next visible step so progress bars stay sane instead of jumping to
      // 100%. Match the behaviour the wizard auto-migration will produce.
      if (s.id === current) return idx + 1;
      continue;
    }
    idx++;
    if (s.id === current) return idx;
  }
  // current is past the last visible step — clamp to the total visible count.
  return idx;
}
