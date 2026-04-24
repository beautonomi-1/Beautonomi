import { NextRequest } from "next/server";

const _VERCEL_CRON_USER_AGENT = "vercel-cron/1.0";

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the project
 * defines `CRON_SECRET` in the Vercel env (recommended). `INTERNAL_API_SECRET`
 * is accepted as a fallback only if you set the same value as the Bearer token
 * yourself (Vercel does not auto-inject it for crons).
 *
 * When `VERCEL` is set, requests must include `x-vercel-id` so ad-hoc curls
 * with a leaked secret from outside Vercel still fail.
 */
export function verifyCronRequest(request: NextRequest): { valid: boolean; error?: string } {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;
  
  if (!cronSecret) {
    console.error("CRON_SECRET (or INTERNAL_API_SECRET) not set — refusing cron request");
    return { valid: false, error: "Server configuration error" };
  }
  
  if (authHeader !== `Bearer ${cronSecret}`) {
    return { valid: false, error: "Invalid authorization" };
  }
  
  // 2. In production, also verify Vercel cron user agent
  if (process.env.VERCEL_ENV === "production") {
    const userAgent = request.headers.get("user-agent") || "";
    if (!userAgent.includes("vercel-cron")) {
      console.warn(`Cron route called with unexpected user-agent: ${userAgent}`);
      // Log but don't block — some manual triggers are legitimate
    }
  }
  
  // 3. Check x-vercel-id header exists (present on all Vercel-originated requests)
  const vercelId = request.headers.get("x-vercel-id");
  if (process.env.VERCEL && !vercelId) {
    return { valid: false, error: "Request must originate from Vercel" };
  }
  
  return { valid: true };
}
