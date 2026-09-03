/**
 * Phase-2 stub only. Do not implement WebAuthn.
 * Client UI reads NEXT_PUBLIC_AUTH_PASSKEYS; server also accepts AUTH_PASSKEYS=1.
 */
export function isAuthPasskeysEnabled(): boolean {
  const publicFlag = process.env.NEXT_PUBLIC_AUTH_PASSKEYS;
  const serverFlag = process.env.AUTH_PASSKEYS;
  return publicFlag === "1" || publicFlag === "true" || serverFlag === "1" || serverFlag === "true";
}
