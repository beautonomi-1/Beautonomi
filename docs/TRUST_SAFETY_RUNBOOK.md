# Trust & Safety Runbook

Operational guide for Beautonomi Trust & Safety (UGC, blocks, moderation, age-gating).

## Architecture overview

| Pillar | Implementation |
|--------|----------------|
| Block / mute | `user_blocks`, `user_mutes` tables; `/api/me/blocks`, `/api/me/mutes` |
| Moderation | `content_reports` + `moderation-actions.ts` takedown service |
| Age-gating | `requireSocialAccess()` + feature flags `safety.social_age_gate_mode` |
| Safety Hub | Customer/provider mobile screens at `/safety` |

## Content reports workflow

1. User submits via `POST /api/reports/content` (mobile `ContentReportSheet`).
2. Slack alert: `safety.content_report.created` (best effort).
3. Auto-hide (optional): when `safety.auto_hide_report_threshold` is **enabled**; threshold/window read from flag metadata (`threshold`, `window_hours`, defaults 3 / 24h).
4. Admin reviews at **Admin → Content Reports** (`/admin/content-reports`).
5. Resolve actions:
   - **Resolve** — close report only
   - **Resolve + hide** — calls `applyContentModerationTakedown` and sets `takedown_applied`
   - **Dismiss** — no content action
6. SLA cron: pending reports older than 24h emit `safety.content_report.sla_overdue` via operational alerts.

## Block enforcement

- Bidirectional: `assertNotBlocked(actor, peer)` on message send, **upload**, and conversation create.
- Explore: blocked/muted authors filtered in list feed, **single-post GET**, and comments.
- Mobile: block via user ID or `provider_id` (resolves to provider owner).

## Age-gate rollout (enforce flip)

**Current default:** `safety.social_age_gate_mode` metadata `{ "mode": "log" }` (see migration 828).

### Pre-enforce checklist

1. Monitor logs for `[safety] social access would block` while mode = `log`.
2. Backfill users with `age_band = unknown` — prompt via onboarding / profile DOB.
3. Confirm teen defaults: `disable_direct_messaging: true` for 13–17 in `safety.restricted_mode_defaults`.
4. Verify server guards on all UGC write paths (explore create/upload/patch, comments, DMs, reviews).

### Enforce flip (production)

1. Admin → Feature flags → `safety.social_age_gate_mode`
2. Set metadata to `{ "mode": "enforce" }`
3. Monitor 403 `SOCIAL_RESTRICTED` rates and support tickets for 48h.

### Post-enforce

- Device age signals: `POST /api/me/age-signal` (behind flag; client stub in `device-age-range.ts`).
- Web onboarding step 3 requires DOB (matches mobile).

## Panic button

- Gated: `safety_module_config.enabled` + `safety.panic.enabled`.
- `POST /api/me/safety/panic` stores event + emergency contact in metadata.
- Slack: `safety.panic.created` with emergency contact when on file.

## App Store references

- Customer app ID: `6748387058`
- Provider app ID: `6748387936`
- See also: [APP_STORE_AGE_RATING.md](./APP_STORE_AGE_RATING.md)

## Key files

- `apps/web/src/lib/safety/user-blocks.ts`
- `apps/web/src/lib/safety/moderation-actions.ts`
- `apps/web/src/lib/safety/require-social-access.ts`
- `supabase/migrations/836_trust_safety_blocks_mutes_moderation.sql`
- `supabase/migrations/837_trust_safety_device_age_signal_columns.sql`
