/**
 * Built-in prompt templates for provider AI features.
 */

export interface AiFeatureTemplate {
  system: string;
  userPrompt: string;
  /** When omitted, runtime default + router picks the model. */
  model?: string;
  outputSchema: Record<string, unknown>;
}

export const AI_FEATURE_PROFILE_COMPLETION = "ai.provider.profile_completion";
export const AI_FEATURE_CONTENT_STUDIO = "ai.provider.content_studio";
export const AI_FEATURE_SMART_REPLIES = "ai.provider.smart_replies";
export const AI_FEATURE_PRICING_ASSISTANT = "ai.provider.pricing_assistant";
export const AI_FEATURE_BOOKING_OPS = "ai.provider.booking_ops";
export const AI_FEATURE_REPUTATION_COACH = "ai.provider.reputation_coach";
export const AI_FEATURE_LOOK_DESCRIBE = "ai.provider.look_describe";

export const FEATURE_TEMPLATES: Record<string, AiFeatureTemplate> = {
  [AI_FEATURE_PROFILE_COMPLETION]: {
    system: `You are a helpful assistant for beauty and wellness providers. Given the provider context, suggest improvements for their profile: headline, short bio, specialties, FAQ, and policies. Respond with a JSON object: { "suggested_profile_patch": { "headline": string, "bio": string, "specialties": string[], "faq": string[], "policies": string[] } }. Only include fields you suggest; omit null.`,
    userPrompt: "Suggest profile improvements based on the provider context.",
    outputSchema: {
      type: "object",
      properties: {
        suggested_profile_patch: {
          type: "object",
          properties: {
            headline: { type: "string" },
            bio: { type: "string" },
            specialties: { type: "array", items: { type: "string" } },
            faq: { type: "array", items: { type: "string" } },
            policies: { type: "array", items: { type: "string" } },
          },
        },
      },
      required: ["suggested_profile_patch"],
    },
  },
  [AI_FEATURE_CONTENT_STUDIO]: {
    system: `You are a social media assistant for beauty and wellness providers. Given the provider context, suggest post captions and hashtags. Respond with a JSON object: { "post_captions": string[], "hashtags": string[], "short_description": string }. Keep captions concise and on-brand.`,
    userPrompt: "Suggest post captions, hashtags, and a short description for the provider.",
    outputSchema: {
      type: "object",
      properties: {
        post_captions: { type: "array", items: { type: "string" } },
        hashtags: { type: "array", items: { type: "string" } },
        short_description: { type: "string" },
      },
      required: ["post_captions", "hashtags", "short_description"],
    },
  },
  [AI_FEATURE_SMART_REPLIES]: {
    system: `You draft short reply options for a beauty provider inbox. Advisory only — never send messages. JSON: { "replies": string[] } with 2-4 polite options.`,
    userPrompt: "Draft reply options for this inbound message.",
    outputSchema: {
      type: "object",
      properties: { replies: { type: "array", items: { type: "string" } } },
      required: ["replies"],
    },
  },
  [AI_FEATURE_PRICING_ASSISTANT]: {
    system: `You suggest advisory pricing from the provider offerings capsule. Never change prices in the system. JSON: { "suggestions": [{ "offering_name": string, "suggested_price": number, "rationale": string }] }.`,
    userPrompt: "Review offerings and suggest price adjustments if warranted.",
    outputSchema: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              offering_name: { type: "string" },
              suggested_price: { type: "number" },
              rationale: { type: "string" },
            },
            required: ["offering_name", "suggested_price", "rationale"],
          },
        },
      },
      required: ["suggestions"],
    },
  },
  [AI_FEATURE_BOOKING_OPS]: {
    system: `Draft SMS/message templates for booking operations. Advisory drafts only. JSON: { "reminder_sms": string, "no_show_sms": string, "reschedule_message": string }.`,
    userPrompt: "Draft reminder, no-show, and reschedule message templates.",
    outputSchema: {
      type: "object",
      properties: {
        reminder_sms: { type: "string" },
        no_show_sms: { type: "string" },
        reschedule_message: { type: "string" },
      },
      required: ["reminder_sms", "no_show_sms", "reschedule_message"],
    },
  },
  [AI_FEATURE_REPUTATION_COACH]: {
    system: `Coach a provider on review responses. Advisory only. JSON: { "review_replies": string[], "recovery_tips": string[] }.`,
    userPrompt: "Suggest review reply drafts and recovery tips from the pasted review.",
    outputSchema: {
      type: "object",
      properties: {
        review_replies: { type: "array", items: { type: "string" } },
        recovery_tips: { type: "array", items: { type: "string" } },
      },
      required: ["review_replies", "recovery_tips"],
    },
  },
  [AI_FEATURE_LOOK_DESCRIBE]: {
    system: `Describe a beauty look from an image for accessibility and discovery. JSON: { "caption": string, "tags": string[], "alt_text": string }.`,
    userPrompt: "Describe this look for caption, tags, and alt text.",
    outputSchema: {
      type: "object",
      properties: {
        caption: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        alt_text: { type: "string" },
      },
      required: ["caption", "tags", "alt_text"],
    },
  },
};

export function isKnownAiFeature(featureKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(FEATURE_TEMPLATES, featureKey);
}
