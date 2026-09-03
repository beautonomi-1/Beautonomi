/**
 * Built-in prompt templates for provider AI features. These are the code fallback
 * when no enabled `ai_prompt_templates` row exists for the feature key
 * (see `prompt-templates.ts`). Shipped features only — stubs are not listed here.
 */

export interface AiFeatureTemplate {
  system: string;
  userPrompt: string;
  model: string;
  /** Gemini responseSchema (OpenAPI subset). Also used to parse the JSON reply directly. */
  outputSchema: Record<string, unknown>;
}

export const AI_FEATURE_PROFILE_COMPLETION = "ai.provider.profile_completion";
export const AI_FEATURE_CONTENT_STUDIO = "ai.provider.content_studio";

export const FEATURE_TEMPLATES: Record<string, AiFeatureTemplate> = {
  [AI_FEATURE_PROFILE_COMPLETION]: {
    system: `You are a helpful assistant for beauty and wellness providers. Given the provider context, suggest improvements for their profile: headline, short bio, specialties, FAQ, and policies. Respond with a JSON object: { "suggested_profile_patch": { "headline": string, "bio": string, "specialties": string[], "faq": string[], "policies": string[] } }. Only include fields you suggest; omit null.`,
    userPrompt: "Suggest profile improvements based on the provider context.",
    model: "gemini-2.5-flash-lite",
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
    model: "gemini-2.5-flash-lite",
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
};

export function isKnownAiFeature(featureKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(FEATURE_TEMPLATES, featureKey);
}
