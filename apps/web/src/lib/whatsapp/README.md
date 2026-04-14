# WhatsApp Lead Outreach via WasenderAPI

Server-side integration for WhatsApp messaging through [WasenderAPI](https://wasenderapi.com/api-docs).

## Setup

### 1. Environment Variables (optional fallback)

```env
WASENDER_PAT=your-personal-access-token
WASENDER_BASE_URL=https://app.wasenderapi.com
```

The primary configuration lives in the `wasender_integration_config` database table (managed via the admin Control Plane UI). Environment variables serve as a fallback when the DB config is unavailable.

### 2. Database Migration

Run migration `480_whatsapp_wasender_integration.sql` which creates:

| Table | Purpose |
|---|---|
| `wasender_integration_config` | API credentials and safety limits per environment |
| `whatsapp_sessions` | Connected WhatsApp numbers / WasenderAPI sessions |
| `whatsapp_templates` | Predefined message templates with placeholder support |
| `whatsapp_message_queue` | Queued messages processed by cron |
| `whatsapp_bulk_batches` | Tracks bulk send campaigns |
| `whatsapp_number_checks` | Verification cache (is number on WhatsApp?) |

Also adds `whatsapp_status` and `whatsapp_checked_at` columns to `provider_leads`.

### 3. Configure in Admin Portal

1. **Superadmin > Control Plane > Integrations > WhatsApp (Wasender)**
   - Add your WasenderAPI Personal Access Token
   - Set webhook secret for inbound events
   - Configure rate limits and safety thresholds

2. **Admin > WhatsApp Sessions**
   - Connect one or more WhatsApp numbers via QR code scanning
   - Monitor session health and send counters

3. **Admin > WhatsApp Templates**
   - Create/edit message templates with `{{placeholder}}` support
   - 5 default templates are seeded by the migration

### 4. Webhook Configuration

Configure your WasenderAPI webhook URL to:
```
https://your-domain.com/api/webhooks/wasender
```

Set the webhook secret in the admin config to enable signature verification.

## API Routes

### Admin Routes (require authentication)

| Method | Path | Description |
|---|---|---|
| `GET/PUT` | `/api/admin/integrations/wasender` | Manage Wasender config |
| `GET/POST` | `/api/admin/whatsapp/sessions` | List/create sessions |
| `GET/DELETE` | `/api/admin/whatsapp/sessions/[id]` | Session details/delete |
| `POST` | `/api/admin/whatsapp/sessions/[id]/connect` | Trigger QR connect |
| `POST` | `/api/admin/whatsapp/sessions/[id]/disconnect` | Disconnect session |
| `GET` | `/api/admin/whatsapp/sessions/[id]/qr` | Get QR code |
| `POST` | `/api/admin/whatsapp/send` | Send single message |
| `POST` | `/api/admin/whatsapp/verify-number` | Check if number is on WhatsApp |
| `GET/POST` | `/api/admin/whatsapp/templates` | List/create templates |
| `PUT/DELETE` | `/api/admin/whatsapp/templates/[id]` | Update/archive template |
| `GET/POST` | `/api/admin/whatsapp/bulk` | List batches / queue bulk send |
| `GET` | `/api/admin/whatsapp/bulk/[batchId]` | Batch detail with messages |
| `POST` | `/api/admin/whatsapp/bulk/[batchId]/pause` | Pause batch |
| `POST` | `/api/admin/whatsapp/bulk/[batchId]/resume` | Resume batch |
| `POST` | `/api/admin/whatsapp/bulk/[batchId]/cancel` | Cancel remaining |

### Cron Routes (Vercel Cron)

| Schedule | Path | Description |
|---|---|---|
| Every 2 min | `/api/cron/process-whatsapp-queue` | Process up to 10 queued messages |
| Every hour | `/api/cron/reset-whatsapp-counters` | Reset hourly/daily send counters |

### Webhook

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/webhooks/wasender` | Receive WasenderAPI events |

## Safety & Anti-Blocking

The system enforces multiple safety layers:

- **Batch size cap**: max 50 leads per bulk send (hard max 100)
- **Daily limit**: 200 messages/session/day (configurable 50–500)
- **Hourly limit**: 30 messages/session/hour (configurable 10–60)
- **Pacing**: 5+ seconds between messages (min 3s)
- **Auto-pause**: Session pauses after 3 consecutive failures
- **Cooldown**: 30-minute cooldown before resume after auto-pause
- **Deduplication**: Bulk send skips leads messaged within 24h
- **Per-cron cap**: Max 10 messages processed per cron invocation
- **Verification cache**: Number checks cached for 7 days

## Template Placeholders

Templates support these placeholders:

| Placeholder | Source |
|---|---|
| `{{first_name}}` | First word of contact/lead name |
| `{{last_name}}` | Remaining words of name |
| `{{full_name}}` | Full contact name |
| `{{business_name}}` | Lead's business name |
| `{{email}}` | Lead email |
| `{{phone}}` | Lead phone number |

## Permissions (RBAC)

| Action | Required Role |
|---|---|
| Manage API keys/config | `superadmin`, `admin_integrations` |
| Manage sessions | `superadmin`, `admin_integrations` |
| Manage templates | `superadmin`, `admin_operations`, `admin_support` |
| Send individual message | `superadmin`, `admin_operations`, `admin_support` |
| Verify number | `superadmin`, `admin_operations`, `admin_support` |
| Bulk send | `superadmin`, `admin_operations` |

## Architecture

```
Admin-Web SPA
  ├── Lead Detail → WhatsApp panel (sidebar)
  ├── Lead List → WhatsApp quick action + bulk selection
  ├── WhatsApp Sessions page
  ├── WhatsApp Templates page
  └── Control Plane → Wasender config

Next.js API Routes
  ├── /api/admin/whatsapp/* → Session/message/template management
  ├── /api/admin/integrations/wasender → Config management
  ├── /api/cron/process-whatsapp-queue → Queue processor
  ├── /api/cron/reset-whatsapp-counters → Counter resets
  └── /api/webhooks/wasender → Inbound events

Supabase (PostgreSQL)
  ├── wasender_integration_config
  ├── whatsapp_sessions
  ├── whatsapp_templates
  ├── whatsapp_message_queue
  ├── whatsapp_bulk_batches
  └── whatsapp_number_checks

External
  └── WasenderAPI (wasenderapi.com)
```

## Files

### New files created

**Database**: `supabase/migrations/480_whatsapp_wasender_integration.sql`

**Backend** (`apps/web/src/`):
- `lib/whatsapp/wasender-client.ts` — WasenderAPI HTTP client
- `app/api/admin/integrations/wasender/route.ts`
- `app/api/admin/whatsapp/sessions/route.ts` + `[id]/route.ts` + connect/disconnect/qr
- `app/api/admin/whatsapp/send/route.ts`
- `app/api/admin/whatsapp/verify-number/route.ts`
- `app/api/admin/whatsapp/templates/route.ts` + `[id]/route.ts`
- `app/api/admin/whatsapp/bulk/route.ts` + `[batchId]/route.ts` + pause/resume/cancel
- `app/api/cron/process-whatsapp-queue/route.ts`
- `app/api/cron/reset-whatsapp-counters/route.ts`
- `app/api/webhooks/wasender/route.ts`

**Frontend** (`apps/admin-web/src/`):
- `routes/control-plane/CpIntegrationWasenderPage.tsx`
- `routes/whatsapp/WhatsAppSessionsPage.tsx`
- `routes/whatsapp/WhatsAppTemplatesPage.tsx`
- `routes/whatsapp/WhatsAppBatchDetailPage.tsx`
- `components/whatsapp/LeadWhatsAppPanel.tsx`
- `components/whatsapp/WhatsAppSendModal.tsx`
- `components/whatsapp/BulkWhatsAppModal.tsx`

### Modified files

- `apps/admin-web/src/App.tsx` — Added routes
- `apps/admin-web/src/lazyAdminPages.tsx` — Added lazy imports
- `apps/admin-web/src/config/nav.ts` — Added WhatsApp nav items
- `apps/admin-web/src/lib/adminQueryKeys.ts` — Added whatsapp query keys
- `apps/admin-web/src/routes/control-plane/CpIntegrationsHubPage.tsx` — Added Wasender card
- `apps/admin-web/src/routes/provider-ops/ProviderOpsLeadDetailPage.tsx` — Added WhatsApp button + panel
- `apps/admin-web/src/routes/provider-ops/ProviderOpsLeadsPage.tsx` — Added WhatsApp quick actions + bulk
- `apps/web/vercel.json` — Added cron schedules
