# Mobile apps readiness – how far and will it work on all platforms?

## Summary

- **Provider mobile** and **customer mobile** are **Expo (SDK 54)** apps targeting **iOS, Android, and web**. They use the **same backend APIs** as the Next.js provider portal and customer web.
- **Core flows are integrated.** Full booking detail (payments/refunds), client CRUD, Yoco, automations, subscription, Twilio, and cancellation policies are **implemented on the provider mobile app**. Remaining gaps are truly web-only or optional (e.g. bulk booking actions, custom forms), not missing API support for what the mobile apps do.
- **Behaviour is aligned across platforms** where the same APIs and location/branch logic are used. Store deployment (EAS/build) and platform-specific testing (push, payments, deep links) are what’s left to confirm “everything works” on each platform.

---

## How far are the mobile apps from being ready?

### Provider mobile

- **Integrated today (same APIs as web):**  
  Bookings (list, filters, status), calendar, time blocks, team/staff, days off, **locations** (and **global location selector** – `selectedLocationId` is passed as `location_id` to dashboard, calendar, sales, team, new booking, finance), waitlist, group bookings, gallery, routes, dashboard, profile, reports, settings (booking-link, travel-fees, addons, etc.), explore, gamification, and more.
- **Also on mobile (same APIs as web):**  
  Full booking detail (request-payment, mark-paid, refund, receipt/send, send-payment-link, notify-reschedule/cancellation/resend, additional-charges, Yoco card), full client CRUD, Yoco devices and payments, automations, Twilio integration, subscription/billing, cancellation policies, product orders and returns. These are **complete on mobile**; the API integration report lists the screens (e.g. `more/bookings/[id].tsx`, `more/clients/[id].tsx`, `more/settings/yoco-devices.tsx`, `more/settings/automations.tsx`, `more/settings/twilio-integration.tsx`, `more/subscription.tsx`, `more/settings/cancellation-policies.tsx`).
- **Web-only (by design or optional):**  
  Bulk booking actions, custom forms, calendar sync preferences UI, staff permissions, zone analytics, Mangomint, business-details form, product catalogue UI, reference-data, and similar. These are **feature** gaps, not API gaps.
- **Branch/location:**  
  The provider app already uses the **location selector** and passes `location_id` where the report and code show (dashboard, calendar, bookings, team, sales, finance, new booking). Add-on and package **filtering by location** is in the API; the provider app can pass `location_id` when calling addon/package endpoints (e.g. in settings or future booking UI) so behaviour matches web.

**Conclusion:** For the **current mobile scope**, the provider app is **ready from an API and location-scoping perspective**. “Ready” for your product means: finishing any remaining UI you care about, EAS/build and store listing, and platform-specific testing.

### Customer mobile

- **Integrated:**  
  Home (same home API as web – nearest/top rated, etc.), provider detail, **booking flow** (service → venue → staff → date → time → hold → checkout), **location_id** for at_salon and address/coords for at_home, **booking-holds** (create + consume), Paystack (saved card + WebView), saved addresses and primary address persistence.
- **Same backend:**  
  Public APIs (`/api/public/home`, `/api/public/providers/[slug]`, booking-holds, etc.) and auth; no separate “customer mobile API” – it uses the same as customer web.

**Conclusion:** Core customer journey (discover → book → pay) is **integrated**. Ready for “launch” again depends on build, store, and testing (payments on device, deep links, push).

---

## Will everything work accordingly on all platforms?

### Backend and behaviour

- **One backend:** Web and mobile share the same Next.js API and Supabase. Location/branch logic (e.g. nearest branch, `location_id` filtering, addon/package/promo by branch) lives in the API, so **behaviour is consistent** for web and mobile as long as:
  - Provider app keeps sending `location_id` where it already does (dashboard, calendar, sales, team, new booking, etc.) and, if you add addon/package lists by branch, passes `location_id` there too.
  - Customer app keeps sending `location_id` for at_salon and address/coords for at_home in the hold/booking flow (it already does).
- So **logically**, everything that’s implemented **will work the same** on iOS, Android, and web for those flows.

### Platforms (iOS, Android, web)

- **Expo** is configured for **iOS**, **Android**, and **web** in both apps (`app.json`: `ios`, `android`, `web`). Scripts: `npm run ios`, `npm run android`, `npm run web`.
- **What to verify per platform:**
  - **Auth:** Supabase (e.g. phone OTP) – should work on all; test on each.
  - **Payments:** Customer app uses Paystack (saved card server-side; new card via WebView). Test WebView and redirects on real iOS/Android devices.
  - **Push:** OneSignal is wired (app.json entitlements / plugins). Ensure OneSignal and backend (`POST /api/me/devices`, etc.) are configured and tested on iOS and Android.
  - **Deep links:** `associatedDomains` (iOS) and `intentFilters` (Android) point at beautonomi.com. Confirm universal links / app links work for provider and customer on both OSes.
  - **Maps/location:** Customer app uses coords/address for home and at_home; provider may use location. Test location permissions and behaviour on iOS and Android.
- **EAS / store builds:** `app.json` has placeholder EAS project IDs (`REPLACE_WITH_PROVIDER_PROJECT_ID`, `REPLACE_WITH_CUSTOMER_PROJECT_ID`). To ship to App Store / Play Store you need real EAS projects and store listings; that’s a **deployment** step, not an integration gap.

---

## Practical checklist (high level)

| Area | Status | Note |
|------|--------|------|
| Provider mobile ↔ API | ✅ Integrated for current scope | Location selector and `location_id` in use; addon/package by branch supported by API when mobile passes `location_id`. |
| Customer mobile ↔ API | ✅ Integrated | Home, book, hold, consume, payments use same public APIs as web. |
| Branch/location behaviour | ✅ Aligned | Same APIs and rules; mobile sends `location_id` / address where required. |
| iOS / Android / Web targets | ✅ Configured | Expo + app.json; all three platforms in scope. |
| EAS / store builds | ⚠️ Placeholder | Replace EAS project IDs and complete store listing when ready to ship. |
| Per-platform testing | ⚠️ Recommended | Auth, Paystack WebView, push, deep links, location on real devices. |

**Bottom line:** The mobile apps are **close to ready** for what they currently do: same APIs as web, location/branch behaviour consistent, and multi-platform (iOS, Android, web) in the project. Remaining work is: (1) any extra mobile-only features you want, (2) EAS and store setup, and (3) platform-specific testing so that “everything works accordingly” on each platform in the real world.
