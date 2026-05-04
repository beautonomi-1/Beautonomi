/**
 * Next.js Edge middleware entry — wires Supabase session refresh, CSRF, and auth guards.
 * Implementation lives in `./proxy.ts` (historical split kept for smaller diffs).
 */
export { proxy as default, config } from "./proxy";
