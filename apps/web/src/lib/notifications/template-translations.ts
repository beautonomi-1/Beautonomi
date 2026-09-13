import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLanguageCode } from "@beautonomi/i18n/language-registry";

export type LocalizedTemplateCopy = {
  title: string;
  body: string;
  emailSubject: string;
  emailBody: string;
  smsBody: string;
};

function substituteVars(text: string, variables: Record<string, string>): string {
  let out = text;
  for (const [key, value] of Object.entries(variables)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return out;
}

/** Load per-language overrides for a template key. */
export async function getTemplateTranslationRows(
  client: SupabaseClient,
  templateKey: string,
  languageCodes: readonly string[],
): Promise<Map<string, LocalizedTemplateCopy>> {
  const codes = [...new Set(languageCodes.map((c) => normalizeLanguageCode(c)))];
  if (codes.length === 0) return new Map();

  const { data } = await client
    .from("notification_template_translations")
    .select("language_code, title, body, email_subject, email_body, sms_body")
    .eq("template_key", templateKey)
    .eq("is_active", true)
    .in("language_code", codes);

  const out = new Map<string, LocalizedTemplateCopy>();
  for (const row of data ?? []) {
    const code = normalizeLanguageCode(String(row.language_code ?? ""));
    out.set(code, {
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      emailSubject: String(row.email_subject ?? row.title ?? ""),
      emailBody: String(row.email_body ?? row.body ?? ""),
      smsBody: String(row.sms_body ?? row.body ?? ""),
    });
  }
  return out;
}

/** Resolved copy for one recipient language (variables substituted). */
export function resolveLocalizedTemplateCopy(
  base: LocalizedTemplateCopy,
  translations: Map<string, LocalizedTemplateCopy>,
  language: string,
  variables: Record<string, string>,
): LocalizedTemplateCopy {
  const lang = normalizeLanguageCode(language);
  const row = translations.get(lang) ?? base;
  return {
    title: substituteVars(row.title || base.title, variables),
    body: substituteVars(row.body || base.body, variables),
    emailSubject: substituteVars(row.emailSubject || base.emailSubject, variables),
    emailBody: substituteVars(row.emailBody || base.emailBody, variables),
    smsBody: substituteVars(row.smsBody || base.smsBody, variables),
  };
}

/**
 * Language keys OneSignal accepts in `headings`/`contents`
 * (https://documentation.onesignal.com/docs/en/multi-language-messaging). Any other key
 * makes the whole create-message request fail with "Invalid language code" — for every
 * recipient, not just the one with that language. Registry codes outside this list
 * (af, zu, xh, st, nso, tn, ts, ve, ss, sw, am, rw, …) therefore fall back to English
 * in push; email/SMS still use the recipient's full language via
 * `resolveLocalizedTemplateCopy`.
 */
const ONESIGNAL_LANGUAGE_CODES = new Set([
  "en", "ar", "az", "bs", "ca", "zh-Hans", "zh-Hant", "hr", "cs", "da", "nl", "et", "fi", "fr",
  "ka", "bg", "de", "el", "hi", "he", "hu", "id", "it", "ja", "ko", "lv", "lt", "ms", "nb", "fa",
  "pl", "pt", "pa", "ro", "ru", "sr", "sk", "es", "sv", "th", "tr", "uk", "vi",
]);

/** Map a registry code (en-GB, pt-BR, zu, …) to a OneSignal key, or null when unsupported. */
export function toOneSignalLanguageCode(code: string): string | null {
  const normalized = normalizeLanguageCode(code);
  if (ONESIGNAL_LANGUAGE_CODES.has(normalized)) return normalized;
  const base = normalized.split("-")[0] ?? "";
  return ONESIGNAL_LANGUAGE_CODES.has(base) ? base : null;
}

export function buildLocalizedPushMaps(
  base: LocalizedTemplateCopy,
  translations: Map<string, LocalizedTemplateCopy>,
  languages: readonly string[],
  variables: Record<string, string>,
): { headings: Record<string, string>; contents: Record<string, string> } {
  const headings: Record<string, string> = {};
  const contents: Record<string, string> = {};

  // Always ship English (OneSignal requires it as the default entry).
  headings.en = substituteVars(base.title, variables);
  contents.en = substituteVars(base.body, variables);

  for (const raw of languages) {
    const lang = normalizeLanguageCode(raw);
    const osCode = toOneSignalLanguageCode(lang);
    if (!osCode || osCode === "en") continue;
    // Prefer an exact-locale row (pt-BR), then its base (pt); skip if neither has copy —
    // OneSignal would otherwise show an English duplicate under a non-English key.
    const row = translations.get(lang) ?? translations.get(osCode);
    if (!row) continue;
    if (headings[osCode] !== undefined) continue;
    headings[osCode] = substituteVars(row.title || base.title, variables);
    contents[osCode] = substituteVars(row.body || base.body, variables);
  }

  return { headings, contents };
}

/** Resolve distinct recipient languages from users.preferred_language. */
export async function getRecipientLanguageCodes(
  client: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data } = await client
    .from("users")
    .select("id, preferred_language")
    .in("id", [...userIds]);

  const out = new Map<string, string>();
  for (const row of data ?? []) {
    const id = String(row.id ?? "");
    if (!id) continue;
    out.set(id, normalizeLanguageCode(String(row.preferred_language ?? "en")));
  }
  return out;
}
