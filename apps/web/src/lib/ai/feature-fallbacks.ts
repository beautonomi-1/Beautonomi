/**
 * Deterministic, template-driven payloads served when `enforceAiBudget` returns
 * `fallback_mode: "templates_only"` (daily budget / per-tenant caps / global spend cap).
 *
 * The provider AI route returns these with HTTP 200 and `fallback: true` so the
 * UI keeps working (with a "generated from your profile" hint) instead of a 403.
 * No model call is made and nothing is written to `ai_usage_log`.
 */
import type { ProviderContextCapsule } from "./provider-context";
import { AI_FEATURE_CONTENT_STUDIO, AI_FEATURE_PROFILE_COMPLETION } from "./feature-templates";

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
  if (params.featureKey === AI_FEATURE_PROFILE_COMPLETION) {
    body = buildProfileCompletionFallback(params.capsule, input);
  } else if (params.featureKey === AI_FEATURE_CONTENT_STUDIO) {
    body = buildContentStudioFallback(params.capsule, input);
  }
  if (!body) return null;
  return { ...body, fallback: true, fallback_reason: params.reason };
}
