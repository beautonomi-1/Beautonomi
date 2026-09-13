#!/usr/bin/env node
/**
 * Trigger explore embedding backfill via the locked cron route.
 *
 * Usage:
 *   CRON_SECRET=... APP_URL=https://your-app.vercel.app node apps/web/scripts/backfill-explore-embeddings.mjs
 */
const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Set CRON_SECRET to authorize the cron endpoint.");
  process.exit(1);
}

const res = await fetch(`${appUrl}/api/cron/explore-embeddings-backfill`, {
  headers: { authorization: `Bearer ${secret}` },
});
const body = await res.text();
console.log(res.status, body);
process.exit(res.ok ? 0 : 1);
