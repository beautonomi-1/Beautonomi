# Customer app – profile completion and setup audit

## Summary

Profile completion on the customer mobile app is **wired correctly** to the web API and shows a completion card with progress and checklist. A few UX improvements were applied so the flow stays in sync and users can reach all relevant settings.

---

## API

- **GET /api/me/profile-completion** (apps/web)
  - Returns: `{ completed, total, percentage, checklistItems, topItems }` (wrapped in `data` by the API client).
  - Uses: `users` (avatar_url, email_verified, preferred_name, phone, emergency_contact_name), `user_profiles` (about, interests, beauty_preferences, profile-question fields), `user_verifications` (status), `user_addresses` (default address).
- **GET /api/me/verification** – used on profile for the “Identity” badge (`verified`).

---

## Customer app behaviour

1. **Profile tab** (`(app)/(tabs)/profile.tsx`)
   - Fetches profile completion, loyalty, and verification on mount and on **focus** (so returning from Personal info or Account settings refreshes the percentage).
   - Pull-to-refresh also refetches.
   - Completion card is shown when `completionPct < 100` or there are checklist items.
   - **Tap main card** → Account settings → Personal info (name, photo; email/phone read-only).
   - **“Account settings →”** link → Account settings index (so users can open Saved addresses, Login & security, etc.).

2. **Personal info** (`account-settings/personal-info.tsx`)
   - Loads **GET /api/me/profile**; edits name, **phone**, and avatar; **PATCH /api/me/profile** (avatar_url, first_name, last_name, full_name, **phone**, **emergency_contact**).
   - Email is read-only (updated via auth). Phone is editable and persisted so "Add phone" completion can update.
   - **Emergency contact (implemented):** Optional section (name, phone, relationship) saved as `emergency_contact` on profile.

3. **Saved addresses** (`account-settings/addresses.tsx`)
   - **GET/POST/PUT/DELETE /api/me/addresses** – profile completion “Add address” is based on having a default address.

4. **Verification**
   - Profile shows an “Identity” badge from **GET /api/me/verification** (`verified`).
   - **Identity verification in-app (implemented):** Dedicated screen `account-settings/identity-verification` – upload document (POST /api/me/verification), document type, country of issue; shows "Verified" or "Under review" when pending. Linked from Account settings index and profile completion ("identity" deep link).

---

## Checklist items (from API) and where they can be completed on mobile

| Item                  | Where on mobile                          |
|-----------------------|------------------------------------------|
| Add profile photo     | Personal info (avatar upload)            |
| Verify email          | Auth flow / email link (read-only on Personal info) |
| Add preferred name    | Personal info (full name)                |
| Add bio               | Web only (user_profiles.about)            |
| Verify identity       | Account settings → Identity verification (in-app upload)         |
| Add phone             | Personal info (editable); PATCH profile updates completion      |
| Add address           | Account settings → Saved addresses       |
| Add emergency contact | Personal info (optional section; users + user_profiles) |
| Profile questions     | Web only (user_profiles fields)          |
| Add interests         | Web only (user_profiles.interests)       |
| Beauty preferences    | Web only (user_profiles.beauty_preferences) |

---

## Changes made in this audit

1. **Refetch on focus** – `useFocusEffect` on the Profile tab so completion and checklist update when the user returns from Personal info or Account settings.
2. **“Account settings →” on the completion card** – Separate tappable link to Account settings so users can open Saved addresses, Login & security, etc., without relying only on the main card (which goes to Personal info).

---

## Optional improvements (implemented)

- **Phone editing on mobile** – Implemented. Personal info has editable phone field; PATCH profile with `phone` so “Add phone” completion updates.
- **Identity verification in-app** – Implemented. Screen `account-settings/identity-verification`: document type, country, document photo upload (POST /api/me/verification); shows verified/pending; linked from Account settings and profile completion ("identity" → identity-verification).
- **Emergency contact** – Implemented. Optional section in Personal info (name, phone, relationship); saved as `emergency_contact` on profile.
- **Checklist deep links:** Incomplete items on the completion card are tappable and deep-link to Personal info, Login & security, Saved addresses, or Account settings (including Identity verification), as appropriate.
