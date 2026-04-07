# Cookie consent implementation (Beautonomi web)

This document describes the production cookie consent system in **`apps/web`** (Next.js App Router). It is intended for engineers extending integrations and for legal/compliance review of remaining gaps.

## What was implemented

- **First-party consent UI**: bottom **banner** (Accept all / Reject non-essential / Choose categories) and a **preferences** dialog with per-category toggles, save/close, and **focus management** (initial focus on the dialog title; return focus to the control that opened the dialog when possible).
- **Versioned storage** in `localStorage` plus an optional **non-HttpOnly** mirror cookie (skipped if the encoded payload would exceed a safe cookie size; localStorage remains canonical).
- **`CookieConsentProvider`** (`src/providers/CookieConsentProvider.tsx`) exposing readiness flags and category allow/deny for gating.
- **Re-open** entry points: **Footer** (“Cookie settings”, styled like other footer links), **Cookie Policy** (`/cookie-policy`), and **Account → Privacy & sharing** (“This browser” card with the same control).
- **Account sync** (logged-in users): saving choices calls `PATCH /api/me/privacy-settings` with `analytics_consent` so server-side Amplitude gating stays aligned with the **Analytics** toggle when possible.

## Consent categories

| Category | Purpose | Default when “Reject non-essential” |
|----------|---------|-------------------------------------|
| **Strictly necessary** | Security, session integrity, core operation | Always on (not toggleable) |
| **Analytics & performance** | Amplitude (browser SDK), session/product analytics, marketing attribution capture, web-vitals beacon, Vercel Speed Insights | Off |
| **Functional & preferences** | OneSignal web SDK load + device registration hook; persisted locale (`beautonomi_locale`) for i18n when allowed | Off |
| **Marketing & targeting** | Reserved for optional promo/measurement pixels | Off |

Nothing in the current tree is wired **only** to the marketing flag yet; the model and UI are ready so future scripts can subscribe to `allowsMarketing` without another redesign.

## Storage model

- **Key**: `beautonomi_cookie_consent_v1` (`src/lib/cookie-consent/constants.ts`)
- **Shape** (`StoredCookieConsent`): `schemaVersion`, `policyVersion`, ISO `updatedAt`, and `categories` (`necessary` always `true`, plus booleans for `analytics`, `functional`, `marketing`).
- **Validation** (`storage.ts`): rejects malformed JSON, wrong schema version, oversize payloads, **invalid ISO `updatedAt`**, or invalid category shapes; **clears** storage and the mirror cookie when a value is present but invalid.
- **Re-prompt**: if `policyVersion` in storage does not match `POLICY_VERSION`, the banner returns so users can re-confirm after material changes.
- **`POLICY_VERSION`** vs **`CONSENT_SCHEMA_VERSION`**: bump **policy** when categories or legal meaning change (re-prompt). Bump **schema** only when the JSON shape changes (add a migration in `storage.ts`).

Custom event on change: `window` dispatches `beautonomi:cookie-consent-changed` with the stored record (see `storage.ts`).

## Where UI is mounted

- **`ClientAppShell`** wraps the app with `CookieConsentProvider` and renders **`CookieConsentExperience`** (banner + dialog) and **`GatedClientAnalytics`** after the main shell content.
- **SSR**: banner/dialog are client-only; no server render of consent state.

## How to reopen preferences

- Footer: **`CookieSettingsFooterLink`** (`variant="footer"`, optional chevron).
- Cookie policy sidebar: `variant="policy"`.
- Account settings: **Privacy & sharing** → **This browser** card: `variant="inline"`.

## Accessibility

- Preferences dialog uses **`suppressFallbackTitle`** on `DialogContent` so a single visible **`DialogTitle`** is the accessible name (no duplicate `sr-only` “Dialog” title).
- **Initial focus** moves to the dialog **title** (`tabIndex={-1}`) on open.
- **Close** restores focus to the **element that opened** the dialog when `openPreferences(triggerEl)` was used (footer button, `Choose categories`, policy links).
- Category toggles use **`aria-labelledby`** / **`aria-label`**; optional categories are grouped in a **`fieldset`** with a screen-reader-only **legend**.
- Banner is a **`role="region"`** with **`aria-label="Cookie consent notice"`**.

## Script and behavior gating

Consent is enforced in **code paths**, not only by showing the banner.

### Synchronous helpers (outside React)

`src/lib/cookie-consent/guards.ts` exposes **`readAllowsFunctionalFromStorage`**, **`readAllowsAnalyticsFromStorage`**, and **`readAllowsMarketingFromStorage`** for modules that cannot use `useCookieConsent()` (e.g. code that runs from `AuthProvider` or plain TS helpers).

### Analytics (browser)

| Integration | Mechanism |
|-------------|-----------|
| **Amplitude** (`AmplitudeProvider`) | No SDK init until `consentReady` and `allowsAnalytics`; combines cookie choice with logged-in `/api/me/analytics/consent`. |
| **Amplitude Guides & Surveys** (`AmplitudeEngagementProvider`) | Only runs when the Amplitude client is initialized. |
| **`useAmplitude().track` / `identify`** | No-ops when the SDK is not initialized (`hooks/useAmplitude.ts`). |
| **Marketing attribution** (`MarketingAttributionCapture`) | Navigation hook runs only when `allowsAnalytics`. |
| **Attribution storage** (`marketing-attribution.ts`) | **`captureMarketingAttributionFromUrl`**, **`getMarketingAttributionForEvents`**, and **`getFirstTouchForIdentify`** read/write UTM data only when **`readAllowsAnalyticsFromStorage()`** is true (defense in depth). |
| **Session tracker** (`SessionTracker`) | Uses `useAmplitude`; no events without SDK. |
| **Web Vitals + Speed Insights** (`GatedClientAnalytics`) | Mounted only when `allowsAnalytics`. |

### Functional (preferences / convenience storage)

| Integration | Mechanism |
|-------------|-----------|
| **OneSignal** (`OneSignalProvider` + `useOneSignal`) | Script + registration only when `allowsFunctional`. |
| **I18n** (`I18nInit`) | Reads `beautonomi_locale` from `localStorage` only when `allowsFunctional`. |
| **Saved search location** (`beautonomi-header.tsx`) | **`userLocation`** in `localStorage` only via `persistUserLocation` when `consentReady && allowsFunctional`. |
| **Default address → browser** (`AuthProvider`) | Writes **`userLocation`** to `localStorage` only when **`readAllowsFunctionalFromStorage()`**; still dispatches `userLocationChanged` for in-tab UX. |
| **Market manual override** (`MarketAvailabilityGate`) | **`localStorage`** override + geo opt-out cookie only when **`readAllowsFunctionalFromStorage()`**; suppressed tracking still no-ops without Amplitude. |
| **Download banner dismiss** (`DownloadBannerContainer`) | **`sessionStorage`** dismiss key read/written only when `consentReady && allowsFunctional`; dismiss still works for the session via React state. |
| **Recent locations** (`useRecentLocations.ts`) | **`beautonomi_recent_locations`** load/save/clear tied to **`readAllowsFunctionalFromStorage()`**; listens for **`beautonomi:cookie-consent-changed`**. |

### Marketing

| Integration | Mechanism |
|-------------|-----------|
| **Reserved** | Use `allowsMarketing` / `readAllowsMarketingFromStorage()` before loading ad pixels or promo tags; no third-party ad scripts are wired in the client yet. |

### Intentionally not gated (strictly necessary / core flow)

| Area | Notes |
|------|--------|
| **Booking flow persistence** (`booking-flow-persistence.ts`, checkout draft keys) | Treated as **essential** for completing the booking the user requested; not tied to optional cookie categories. |
| **Auth/session** (`beautonomi_auth_cache`, session keys) | **Strictly necessary** for authentication. |

### Not gated by this CMP (by design)

| Integration | Notes |
|-------------|--------|
| **Amplitude server-side** (`server.ts`, API routes) | Business events from trusted backend; **not** controlled by browser cookie consent. Align with privacy policy and DPA. |
| **GlobalErrorLogger** (`layout.tsx`) | Optional debug ingest when `NEXT_PUBLIC_DEBUG_INGEST_URL` is set; **not** wired to the CMP. |

### Integration points for new code

- Import `useCookieConsent()` from `@/providers/CookieConsentProvider`.
- Use `allowsAnalytics`, `allowsFunctional`, `allowsMarketing`, and `isReady` (do not run optional SDKs until `isReady`).
- For one-off listeners, subscribe to `beautonomi:cookie-consent-changed` if you cannot use React context (e.g. a non-React module).
- For non-React modules or code that runs **above** `CookieConsentProvider`, use **`guards.ts`** or subscribe to **`beautonomi:cookie-consent-changed`**.

## Legal / compliance review

- **Jurisdiction-specific texts**, **DPA**, and **lawful basis** wording should be confirmed with counsel; this implementation provides **technical controls** and **clear UX**, not legal advice.
- **Logged-in** analytics previously defaulted to **allowed** on the server when unset; the **banner** still appears for **policy version** / **first visit**; anonymous analytics stay **off** until explicit opt-in (accept or custom allow).
- **Marketing** category is **declared in UI** but not heavily used in code yet—review before enabling any ad pixels.

## Updating copy or categories later

1. **Copy**: edit `COPY` in `src/components/cookie-consent/CookieConsentExperience.tsx` (banner, modal, buttons).
2. **Categories / legal meaning**: update `POLICY_VERSION` in `src/lib/cookie-consent/constants.ts` so existing users see the banner again.
3. **Schema**: bump `CONSENT_SCHEMA_VERSION` and migrate readers in `storage.ts` if the JSON shape changes.
