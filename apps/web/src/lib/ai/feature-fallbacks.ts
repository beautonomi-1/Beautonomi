/**
 * Deterministic, template-driven payloads served when `enforceAiBudget` returns
 * `fallback_mode: "templates_only"` (daily budget / per-tenant caps / global spend cap).
 *
 * The provider AI route returns these with HTTP 200 and `fallback: true` so the
 * UI keeps working (with a "generated from your profile" hint) instead of a 403.
 * No model call is made and nothing is written to `ai_usage_log`.
 */
import type { ProviderContextCapsule } from "./provider-context";
import {
  AI_FEATURE_BOOKING_OPS,
  AI_FEATURE_CONTENT_STUDIO,
  AI_FEATURE_LOOK_DESCRIBE,
  AI_FEATURE_PRICING_ASSISTANT,
  AI_FEATURE_PROFILE_COMPLETION,
  AI_FEATURE_REPUTATION_COACH,
  AI_FEATURE_SMART_REPLIES,
} from "./feature-templates";

export interface AiFallbackPayload {
  fallback: true;
  fallback_reason: string;
  [key: string]: unknown;
}

function slugTag(value: string): string {
  const cleaned = value.replace(/[^a-z0-9]+/gi, "");
  return cleaned ? `#${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}` : "";
}

function topOfferings(capsule: ProviderContextCapsule | null, n: number): string[] {
  return (capsule?.offerings ?? [])
    .map((o) => (o?.name ?? "").trim())
    .filter(Boolean)
    .slice(0, n);
}

function primaryCity(capsule: ProviderContextCapsule | null): string | null {
  const city = (capsule?.locations ?? []).map((l) => l?.city?.trim()).find(Boolean);
  return city ?? null;
}

function buildProfileCompletionFallback(
  capsule: ProviderContextCapsule | null,
  input: string,
): Record<string, unknown> {
  const name = capsule?.name?.trim() || "Our studio";
  const services = topOfferings(capsule, 5);
  const city = primaryCity(capsule);
  const serviceList = services.length > 0 ? services.join(", ") : "beauty and wellness services";
  const headline = city ? `${name} · ${serviceList.split(", ").slice(0, 2).join(" & ")} in ${city}` : `${name} · ${serviceList.split(", ").slice(0, 2).join(" & ")}`;
  const bioBase =
    capsule?.description?.trim() ||
    `${name} offers ${serviceList}${city ? ` in ${city}` : ""}. Book online in minutes and we'll take care of the rest.`;
  const bio = input.trim() ? `${bioBase} ${input.trim()}`.slice(0, 600) : bioBase.slice(0, 600);

  return {
    suggested_profile_patch: {
      headline: headline.slice(0, 120),
      bio,
      specialties: services,
      faq: [
        "How do I book? Choose a service, pick a time that suits you, and confirm online.",
        "Can I reschedule? Yes — reschedule from your booking confirmation up to the cut-off in our cancellation policy.",
        "What payment methods do you accept? Card payments online and at the salon.",
      ],
      policies: [
        "Please arrive 5 minutes before your appointment.",
        "Late cancellations and no-shows may be charged per our cancellation policy.",
      ],
    },
  };
}

function buildContentStudioFallback(
  capsule: ProviderContextCapsule | null,
  input: string,
): Record<string, unknown> {
  const name = capsule?.name?.trim() || "our studio";
  const services = topOfferings(capsule, 3);
  const city = primaryCity(capsule);
  const focus = input.trim() || services[0] || "your next appointment";
  const hashtags = [
    slugTag(name),
    ...services.map(slugTag),
    city ? slugTag(city) : "",
    "#Beautonomi",
    "#BookOnline",
    "#SelfCare",
  ].filter(Boolean);

  return {
    post_captions: [
      `Treat yourself to ${focus} at ${name}${city ? ` in ${city}` : ""} — book online in seconds.`,
      services.length > 0
        ? `Now booking: ${services.join(", ")}. Tap the link to reserve your spot.`
        : `Fresh slots just opened at ${name}. Tap the link to reserve your spot.`,
      `Loved your visit? Rebook ${focus} today and keep the glow going.`,
    ],
    hashtags: [...new Set(hashtags)].slice(0, 10),
    short_description: `${name}${city ? ` (${city})` : ""}: ${services.length > 0 ? services.join(", ") : "beauty and wellness"}. Book online with Beautonomi.`,
  };
}

function buildSmartRepliesFallback(input: string): Record<string, unknown> {
  return {
    replies: [
      "Thanks for reaching out! We'd love to help — what service and time works best for you?",
      "Hi there! You can book online anytime, or tell us your preferred date and we'll confirm availability.",
      input.trim()
        ? `Thanks for your message. Regarding "${input.trim().slice(0, 80)}" — we'll follow up shortly.`
        : "Thanks for your message — we'll get back to you shortly.",
    ],
  };
}

function buildPricingAssistantFallback(capsule: ProviderContextCapsule | null): Record<string, unknown> {
  const offerings = (capsule?.offerings ?? []).slice(0, 5);
  return {
    suggestions: offerings.map((o) => ({
      offering_name: o.name ?? "Service",
      suggested_price: Number(o.price ?? 0),
      rationale: "Keep current price unless market research suggests otherwise.",
    })),
  };
}

function buildBookingOpsFallback(capsule: ProviderContextCapsule | null): Record<string, unknown> {
  const name = capsule?.name?.trim() || "Our studio";
  return {
    reminder_sms: `Reminder: your appointment at ${name} is tomorrow. Reply if you need to reschedule.`,
    no_show_sms: `We missed you at ${name} today. Rebook online when you're ready — we'd love to see you.`,
    reschedule_message: `No problem — pick a new time for your visit at ${name} via your booking link.`,
  };
}

function buildReputationCoachFallback(input: string): Record<string, unknown> {
  return {
    review_replies: [
      "Thank you for the feedback — we really appreciate you taking the time to share your experience.",
      "We're sorry this didn't meet expectations. Please contact us directly so we can make it right.",
    ],
    recovery_tips: [
      "Respond within 24 hours with empathy and a concrete next step.",
      input.trim() ? "Address the specific concern mentioned in the review." : "Invite the guest to return with a personalized offer if appropriate.",
    ],
  };
}

function buildLookDescribeFallback(capsule: ProviderContextCapsule | null, input: string): Record<string, unknown> {
  const name = capsule?.name?.trim() || "Beauty look";
  const tag = input.trim() || topOfferings(capsule, 1)[0] || "style";
  return {
    caption: `${name} — ${tag} inspiration`,
    tags: [tag, "beauty", "Beautonomi"],
    alt_text: `Photo showing ${tag} by ${name}`,
  };
}

/**
 * Build the fallback payload for a feature. Returns null for unknown features so
 * the route can 404 consistently.
 */
export function buildFeatureFallback(params: {
  featureKey: string;
  capsule: ProviderContextCapsule | null;
  input?: string;
  reason: string;
}): AiFallbackPayload | null {
  const input = params.input ?? "";
  let body: Record<string, unknown> | null = null;
  switch (params.featureKey) {
    case AI_FEATURE_PROFILE_COMPLETION:
      body = buildProfileCompletionFallback(params.capsule, input);
      break;
    case AI_FEATURE_CONTENT_STUDIO:
      body = buildContentStudioFallback(params.capsule, input);
      break;
    case AI_FEATURE_SMART_REPLIES:
      body = buildSmartRepliesFallback(input);
      break;
    case AI_FEATURE_PRICING_ASSISTANT:
      body = buildPricingAssistantFallback(params.capsule);
      break;
    case AI_FEATURE_BOOKING_OPS:
      body = buildBookingOpsFallback(params.capsule);
      break;
    case AI_FEATURE_REPUTATION_COACH:
      body = buildReputationCoachFallback(input);
      break;
    case AI_FEATURE_LOOK_DESCRIBE:
      body = buildLookDescribeFallback(params.capsule, input);
      break;
    default:
      body = null;
  }
  if (!body) return null;
  return { ...body, fallback: true, fallback_reason: params.reason };
}
