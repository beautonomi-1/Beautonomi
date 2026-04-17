# Runbook — Paystack webhook replay

> When a webhook was delivered but we failed to process it (500, network blip,
> signature mismatch after a secret rotation), we can replay it from
> `webhook_events` without contacting Paystack.

## Source of truth

`public.webhook_events` stores every inbound webhook:

| Column        | Meaning                                                           |
| ------------- | ----------------------------------------------------------------- |
| `provider`    | `paystack` / `yoco`                                               |
| `event_type`  | e.g. `charge.success`                                             |
| `status`      | `received` / `processed` / `failed` / `processing`                |
| `payload`     | **sanitized** payload (F7). Contains only non-PII structural keys |
| `processed_at`| When we finished the first successful processing                  |
| `attempt_count` | Number of processing attempts                                   |

`prune-webhook-events` cron deletes `processed` rows after 90 days and
`failed`/`processing` rows after 365 days, so most replays happen within
those windows.

## Replay procedure

1. Identify the stuck event(s):

   ```sql
   SELECT id, provider, event_type, status, attempt_count, last_error
   FROM public.webhook_events
   WHERE status IN ('failed', 'processing')
     AND provider = 'paystack'
   ORDER BY created_at DESC
   LIMIT 50;
   ```

2. Run the admin replay endpoint (requires `admin_finance` role):

   ```bash
   curl -X POST https://<host>/api/admin/webhooks/replay \
     -H "Cookie: <admin session>" \
     -H "Content-Type: application/json" \
     -d '{ "webhook_event_id": "<uuid>" }'
   ```

   The endpoint re-invokes the original handler with the stored sanitized
   payload. Because F7 sanitized the payload at capture time, we do **not**
   replay PII — expected. Sensitive data is re-fetched from Paystack only if
   the handler needs it.

3. Confirm the event transitioned to `processed`:

   ```sql
   SELECT id, status, processed_at, attempt_count
   FROM public.webhook_events
   WHERE id = '<uuid>';
   ```

4. Spot-check downstream effects:

   - `booking_payments.status = 'paid'` (for charge.success)
   - `finance_transactions` has a matching payment row
   - `journal_entries.source = 'finance_transactions'` has a shadow entry

## Rotating the Paystack signing secret

1. Add the new secret in Paystack dashboard.
2. Set `PAYSTACK_WEBHOOK_SECRET_NEXT` in Vercel and re-deploy.
3. Our handler verifies both current + next for a grace window.
4. After 24h, promote `PAYSTACK_WEBHOOK_SECRET_NEXT` to
   `PAYSTACK_WEBHOOK_SECRET` and remove the old one.
5. Replay any events that landed in `failed` during the switchover using the
   procedure above.
