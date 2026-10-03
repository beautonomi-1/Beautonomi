/** Shared Vercel Deployment Protection bypass headers for k6 (CI only). */
export function vercelBypassHeaders() {
  const secret = __ENV.VERCEL_AUTOMATION_BYPASS_SECRET || "";
  if (!secret) return {};
  return {
    "x-vercel-protection-bypass": secret,
    "x-vercel-set-bypass-cookie": "true",
  };
}

export function mergeHeaders(base) {
  return { ...base, ...vercelBypassHeaders() };
}
