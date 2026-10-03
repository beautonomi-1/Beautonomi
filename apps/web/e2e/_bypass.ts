/**
 * Vercel Deployment Protection bypass headers for CI/automation (Option B).
 * @see docs/VERCEL_FIREWALL_MOBILE_APPS.md — never embed in mobile binaries.
 */
export function vercelProtectionBypassHeaders(): Record<string, string> | undefined {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!secret) return undefined;
  return {
    "x-vercel-protection-bypass": secret,
    "x-vercel-set-bypass-cookie": "true",
  };
}
