# Notifications — operations + delivery audit checklist

Companion to `release-fixes-checklist.md`. Use this whenever notification
infrastructure (templates, OneSignal config, Resend / Twilio credentials,
broadcast routes, in-app inbox) changes, or before a campaign that targets
real customers.

## 0. Configuration sanity (admin)

- [ ] `/api/admin/notifications/config` returns the OneSignal app id + REST
      key flags for **both** the customer and provider OneSignal apps.
- [ ] `RESEND_API_KEY` is set in the environment running `apps/web`. The
      admin email broadcast route returns
      `EMAIL_PROVIDER_NOT_CONFIGURED` (HTTP 503) when it is missing.
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`
      are set. Admin SMS broadcast returns `SMS_PROVIDER_NOT_CONFIGURED`
      (HTTP 503) when any are missing.
- [ ] Migration **570** (`570_notification_type_enum_complete.sql`) has been
      applied. Without it, in-app rows for `admin_broadcast` /
      `payment_request` / `additional_charge_requested` are silently
      downgraded to a 413-safe enum value (the row still inserts and the
      bell still updates, but the type label loses fidelity).

## 1. Template inventory (admin SPA)

- [ ] Open **Admin → Marketing → Notification templates**. Every template
      shows the channels it supports.
- [ ] For each template the team relies on (booking lifecycle, payments,
      provider lifecycle, custom offers, admin broadcast), confirm the
      `enabled` toggle is on and the body / email body / SMS body text
      have all `{{variables}}` you expect.

## 2. Push end-to-end (customer + provider apps)

- [ ] Sign in to the customer app on a phone that has a fresh install.
      Check **Settings → Notifications** is allowed at the OS level.
- [ ] Trigger `booking_confirmed` (book + pay one slot). Push lands in
      the OS tray within ~30 seconds, and the in-app notifications
      screen shows a new entry with the correct deep-link target.
- [ ] Open the entry — it should land on the booking, not the generic
      notifications screen.
- [ ] Repeat with the provider app for `provider_booking_request`.
- [ ] Send a test push from the admin "Send test" page; it lands on the
      device of the admin recipient (the route now uses the recipient's
      role to pick the right OneSignal app).

## 3. Admin broadcast — push

- [ ] Compose a push broadcast to "All customers". The audience preview
      shows a non-zero number that matches the tenant scope.
- [ ] Send it. The success message includes both the user-account count
      AND the OneSignal `recipients` reach count. If reach is 0 the UI
      now warns explicitly ("most likely no targeted user has logged
      into the right OneSignal app yet").
- [ ] Confirm the in-app inbox row appears for the broadcast on a
      logged-in customer device.
- [ ] Tapping the broadcast push opens the URL when one was set, or the
      notifications screen otherwise.
- [ ] Repeat for "All providers" using the provider app.

## 4. Admin broadcast — email

- [ ] Compose an email broadcast to "All customers". Audience preview
      shows the count, with the note "Final reach depends on how many
      have an email on file."
- [ ] Send it. The success message reports `Sent X of Y emails via
      Resend.` If any failed, the first failure error from Resend is
      surfaced inline.
- [ ] Verify the email lands in a real customer inbox (subject + body
      + HTML body).
- [ ] Verify a matching in-app inbox row was created with
      `data.channel === "email"` and the broadcast `url` (if set).

## 5. Admin broadcast — SMS

- [ ] Compose an SMS broadcast. Audience preview includes the same
      "depends on how many have a phone on file" note.
- [ ] Send it. Response shows Twilio delivery counts and surfaces the
      first failure error.
- [ ] In-app inbox row created with `data.channel === "sms"`.

## 6. Resend confirmation / reminder

- [ ] On the provider app, open a booking with both an email and phone
      on the customer profile. Tap **Resend confirmation**. The action
      should report `sent: true` and the customer should receive the
      `booking_confirmed` notification.
- [ ] Repeat with **Send reminder**. Confirm the customer's quiet hours
      preferences are honoured (server returns
      `success: true, sent: false, message: "..."` when suppressed).

## 7. In-app notifications inbox

- [ ] Mark an inbox notification as read; row turns read instantly.
- [ ] Mark all read; the badge clears.
- [ ] Tapping a row routes to the correct screen for each `type`
      (booking, order, message, custom_offer, admin_broadcast).

## 8. Devices / token registration

- [ ] On a fresh install, `POST /api/me/devices` succeeds and the
      `app_type` matches the app (provider must register
      `app_type: "provider"`; customer must register
      `app_type: "customer"`). Compromised registrations would otherwise
      misroute push.

## 9. Logs & observability

- [ ] `/api/admin/notifications/logs` shows recent rows for sent +
      failed events. Failed rows include the OneSignal / Resend / Twilio
      error message.
- [ ] `notification_delivery_queue` (admin SQL or supabase studio) shows
      `delivered` rows for normal traffic and `dead_letter` rows only
      when an external provider is genuinely down. DLQ depth alerts in
      Sentry when > 10.

## 10. Disconnected / misconfigured behaviour

- [ ] Temporarily clear `RESEND_API_KEY`. Email broadcast returns
      `EMAIL_PROVIDER_NOT_CONFIGURED` instead of fake-success.
- [ ] Temporarily clear `TWILIO_ACCOUNT_SID`. SMS broadcast returns
      `SMS_PROVIDER_NOT_CONFIGURED`.
- [ ] Clear OneSignal credentials → push broadcast returns
      `ONESIGNAL_NOT_CONFIGURED` and the broadcast log row is `failed`.

---

If a regression appears in any section above, file a ticket tagged
`area:notifications` and assign to platform.
