# Slack integration (admin)

Beautonomi connects Slack via **OAuth v2** (bot token). Alerts are **opt-in per event** with **channel routing** and **deduplication** to avoid noise.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `SLACK_CLIENT_ID` | Slack app client ID |
| `SLACK_CLIENT_SECRET` | Slack app client secret |
| `SLACK_OAUTH_STATE_SECRET` | Optional; HMAC secret for OAuth `state` (defaults to `SLACK_CLIENT_SECRET`) |

## Slack app setup

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps).
2. **OAuth & Permissions** → Redirect URLs:  
   `https://<your-web-origin>/api/admin/integrations/slack/oauth/callback`
3. **Bot token scopes**: `channels:read`, `groups:read`, `chat:write`
4. Install the app to your workspace from the Slack UI while developing, then use **Connect Slack workspace** in **Admin → Integrations → Slack**.

## Admin UI

- **Integrations & dev → Slack** (`/admin/integrations/slack`): connect workspace, master toggle, per-event channel + dedupe window, test message, delivery log.

## Events (high-signal defaults)

- Support immediate: urgent/high ticket created, escalation, reopened ticket, unassigned high/urgent ticket on update.
- Support scheduled: high/urgent unassigned for 30+ minutes, breached SLA, 24h stale follow-up, queue-health threshold.
- Provider Ops immediate: new unassigned lead, reassignment, `won`/`matched` milestone.
- Provider Ops scheduled: stale lead (7d), blocked proposal/negotiation lead (3d), next-step overdue (48h), pipeline-health threshold.
- Finance/Risk scheduled: payout requests, stuck/failed payouts, refund exceptions, negative payout-balance reconciliation warnings, finance exception digest.
- Finance/Risk immediate: payout marked failed.
- Disputes scheduled: new open disputes and open disputes older than 48h.
- Safety scheduled: pending user reports and adverse user reports.
- Verifications scheduled: pending verification review and verification stuck beyond 48h.
- Reports scheduled: daily operations digest and finance exceptions digest.

Tune routing and dedupe windows in the Slack settings page; invite the bot to private channels you select.

## Cron

`/api/cron/slack-operational-alerts` runs hourly via Vercel cron. The runner is intentionally central: module APIs emit direct events, while time-based checks live in one place and still use the same per-event routing, dedupe, Slack delivery logs, and admin deep links.

Known data limits:
- Scheduled support checks can only be tenant-scoped for provider-linked tickets because `support_tickets` does not have a direct `tenant_id`.
- High-value provider lead alerts are not emitted until a reliable value field exists on `provider_leads` or its onboarding metadata is formalized.
