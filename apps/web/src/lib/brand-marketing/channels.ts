export const BRAND_CHANNEL_GROUPS = {
  paid: ["google", "youtube", "meta", "tiktok", "display", "linkedin", "snap", "apple_search", "other_paid"],
  influencer: ["influencer"],
  offline: ["tv", "radio", "outdoor", "print", "cinema", "podcast", "press"],
  owned: [
    "owned_email",
    "owned_sms",
    "owned_push",
    "owned_whatsapp",
    "promo",
    "referral",
    "waitlist",
    "provider_leads",
  ],
  production: ["production", "agency"],
  research: ["research"],
  sponsorship: ["sponsorship"],
  event: ["events"],
} as const;

export function lineTypeForChannelKey(channelKey: string): string {
  for (const [line, keys] of Object.entries(BRAND_CHANNEL_GROUPS)) {
    if ((keys as readonly string[]).includes(channelKey)) return line;
  }
  return "paid";
}
