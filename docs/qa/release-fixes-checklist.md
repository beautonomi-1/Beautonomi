# Release fixes — manual validation checklist

Use after the “Beautonomi platform fixes pass” or any broad booking/push/calendar change.

## Customer booking & pay

- [ ] Book and pay on customer web; complete checkout without false “slot taken” while hold is active.
- [ ] Book again after changing time; hold + consume stay consistent.
- [ ] Customer app: same flows; errors distinguish hold expiry vs conflict when applicable.

## Customer package booking

- [ ] From provider profile, open a package, confirm “What’s included” and Book CTA states (loading / unavailable / ready).
- [ ] Try a second package if available.

## Provider mobile — schedule

- [ ] Add / edit / delete a time block; leave notes empty (no validation error).
- [ ] Edit a closed period; save succeeds (PUT + ISO datetimes).
- [ ] Days off / blocked types still behave as before.

## Provider mobile — calendar

- [ ] Tap slots with 5 / 15 / 30 / 60 min increments; selected time matches row.
- [ ] Drag/drop or hold placement aligns with grid (no double offset at top).
- [ ] Concurrent customer hold renders at correct time (not stuck at top).

## Walk-in sale

- [ ] Cash sale completes.
- [ ] Yoco without reference shows clear error (`YOCO_REFERENCE_REQUIRED`).
- [ ] Long E164 phone does not fail validation spuriously.

## Push

- [ ] Admin broadcast audience preview count loads on compose page.
- [ ] Broadcast creates in-app notification rows where configured.
- [ ] Customer + provider apps receive push; deep link / `admin_broadcast` opens URL or notifications.
- [ ] Image push on iOS/Android when template includes image.

## Provider booking notifications

- [ ] Resend confirmation / reminder; if nothing sent, UI shows reason (channels/preferences).

## Customer search (app)

- [ ] Type-ahead from 1 character; empty + error states visible.
- [ ] Search API errors surface (not silent).

## Custom offers (web provider)

- [ ] Send offer with short description (≥ 5 chars); Send button enables clearly.
- [ ] Customer accepts / pays where applicable.

## Slack admin

- [ ] OAuth connect; channels load when bot token present.
- [ ] Test message to a channel.
- [ ] Delivery logs visible.

## Auth

- [ ] Web email/password login shows signing-in overlay briefly.

---

Record environment (staging URL, build numbers, tester, date) in the release ticket.
