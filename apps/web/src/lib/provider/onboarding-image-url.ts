function trustedStorageOrigins(): string[] {
  return [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL]
    .map((u) => {
      try {
        return u?.trim() ? new URL(u.trim()).origin : null;
      } catch {
        return null;
      }
    })
    .filter((o): o is string => Boolean(o));
}

/** Accept data URLs (legacy) or public storage URLs from this Supabase project. */
export function isTrustedOnboardingImageUrl(raw: string): boolean {
  const v = raw.trim();
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v)) return true;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  return (
    trustedStorageOrigins().includes(u.origin) &&
    u.pathname.startsWith("/storage/v1/object/public/")
  );
}
