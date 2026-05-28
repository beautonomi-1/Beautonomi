import { i18n } from "@beautonomi/i18n";

/** Translate a key under `provider.*` with an English fallback when the locale file is missing it. */
export function pt(
  key: string,
  options?: Record<string, string | number>,
  fallback?: string,
): string {
  return i18n.t(`provider.${key}`, {
    ...(options ?? {}),
    defaultValue: fallback ?? "",
  }) as string;
}

/** Translate a key under `provider.mobile.*` with an English fallback. */
export function pm(
  key: string,
  options?: Record<string, string | number>,
  fallback?: string,
): string {
  return i18n.t(`provider.mobile.${key}`, {
    ...(options ?? {}),
    defaultValue: fallback ?? "",
  }) as string;
}
