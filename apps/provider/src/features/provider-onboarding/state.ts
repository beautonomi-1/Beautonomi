import type { OnboardingFormData, OnboardingStepMeta } from "./types";

export const DEFAULT_COUNTRY_NAME = "South Africa";

export const INITIAL_FORM: OnboardingFormData = {
  owner_name: "",
  owner_email: "",
  owner_phone: "",
  phone_verified: false,
  business_name: "",
  business_type: "salon",
  description: "",
  languages_spoken: ["English"],
  social_media_links: {},
  services: [],
  global_category_ids: [],
  address: {
    line1: "",
    city: "",
    state: "",
    postal_code: "",
    country: DEFAULT_COUNTRY_NAME,
  },
  accepts_custom_requests: true,
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
  { id: 2, title: "Your identity", description: "Name, email, and verified phone" },
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
  { id: 8, title: "Photos", description: "Optional profile & gallery images", canSkip: true },
  {
    id: 9,
    title: "Service zones",
    description: "Where you offer mobile visits",
    canSkip: true,
    conditional: (d) => d.business_type === "mobile" || d.business_type === "both",
  },
  { id: 10, title: "Categories", description: "What you offer" },
  { id: 11, title: "Services", description: "Optional — add services now or later", canSkip: true },
  { id: 12, title: "Hours", description: "When you're available" },
  { id: 13, title: "Review", description: "Check your details" },
  { id: 14, title: "Plan", description: "Choose a subscription" },
];

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
    if (!stepIsVisible(s.id, data)) continue;
    idx++;
    if (s.id === current) return idx;
  }
  return idx;
}
