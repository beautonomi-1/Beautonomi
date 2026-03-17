# Documentation verification

Short record of checks run against the codebase to ensure docs are accurate. Last verification: 2025-03.

---

## Verified true

- **PLATFORM_FEATURES.md** – Customer and provider feature lists match app structure (tabs, account-settings, more menu). Customer account settings correctly list Profile details (no "Business" for customer).
- **ADDITIONAL_CHARGES_AND_PAYOUT_RULES.md** – Platform coverage and "See also" links (REDIRECTS_BY_PLATFORM, PROVIDER_WEB_VS_MOBILE_AUDIT) are valid. Model and payout rules align with implementation intent.
- **CUSTOMER_APP_REFERENCE.md** – Related docs (CUSTOMER_BOOKING_FLOW_AUDIT, ACCOUNT_SETTINGS_AUDIT, CUSTOMER_PROFILE_COMPLETION_AUDIT) exist. API usage map matches `apps/web/src/app/api` and customer app usage.
- **Support tickets API** – `GET /api/me/support-tickets` selects `ticket_number`. `POST /api/me/support-tickets/[id]/messages` exists for user replies. Implemented in `apps/web/src/app/api/me/support-tickets/`.
- **Internal links** – Sampled links in REDIRECTS_BY_PLATFORM, APP_SCREENS_API_WIRING, ADDITIONAL_CHARGES, CUSTOMER_APP_REFERENCE, AUDIT_REPORT, DEPLOYMENT_EAS, IOS_RELEASE_SUBMIT, store-compliance, and GLOBAL_EXPANSION_GUIDE point to existing docs.
- **GAPS_AND_IMPROVEMENTS** – "Done" items (getApiErrorMessage, useBookings/useCart caching, accessibility, invoice download) are reflected in the customer and provider codebases.

---

## Corrections made

1. **GAPS_AND_IMPROVEMENTS.md** – Support tickets section was outdated. Updated to state that `ticket_number` is included in `GET /api/me/support-tickets` and that `POST /api/me/support-tickets/[id]/messages` exists for user replies. Added a short "Status" column so remaining gaps (My tickets UI, ticket number in submit success) are clearly optional.
2. **CUSTOMER_APP_REFERENCE.md** – Account settings stack listed "business" (removed from customer app). Updated to "profile-details" and removed "business" so the route list matches current `apps/customer/app/(app)/account-settings/`.

---

## Recommendations

- **My tickets UI** – API is ready; adding a "My tickets" page (web) or screen (provider app) that calls `GET /api/me/support-tickets` and shows ticket number in submit success would complete the support-ticket flow described in GAPS_AND_IMPROVEMENTS.
- **Periodic re-check** – Re-run verification when adding or removing major routes/APIs or after large doc consolidations. Focus on: API route existence, account-settings and more-menu route lists, and "See also" / related-doc links.
