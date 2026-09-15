import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAgentLocale } from "./i18n-drafts";

export async function resolveUserPreferredLanguage(userId: string | null | undefined): Promise<string> {
  if (!userId) return "en";
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("users")
    .select("preferred_language")
    .eq("id", userId)
    .maybeSingle();
  return resolveAgentLocale((data as { preferred_language?: string | null } | null)?.preferred_language);
}

export function localePromptSuffix(locale: string): string {
  if (!locale || locale === "en") return "";
  return `\nWhen drafting customer-facing text, write in ${locale} (the customer's preferred language).`;
}

export function resolveReplyLocale(params: {
  replyLocaleMode?: string | null;
  recipientLocale: string;
}): string {
  if (params.replyLocaleMode === "platform_en") return "en";
  if (params.replyLocaleMode === "agent_default") return "en";
  return params.recipientLocale;
}
