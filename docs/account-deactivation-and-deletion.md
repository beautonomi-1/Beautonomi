# Account deactivation and deletion – platform overview

How account **deactivation** and **deletion** are managed by **super admins** and by **users**, and how the platform enforces status everywhere (web, customer app, provider app).

---

## 1. Super admin: managing user accounts

### Where

- **Web:** Admin → **Users** (`/admin/users`).
- **APIs:** `GET/PATCH/DELETE /api/admin/users/[id]`.

### Deactivate / reactivate (admin)

- **Deactivate:** In the user list or user detail, use **Deactivate** (or bulk “Deactivate”).  
  - **Backend:** `PATCH /api/admin/users/[id]` with `deactivated_at: <timestamp>`, `deactivation_reason` optional.  
  - **Auth:** Supabase Auth user is **banned** (`auth.admin.updateUserById` with `ban_duration: "876000h"`) so existing tokens stop working.  
  - **DB:** `users.deactivated_at` and `users.deactivation_reason` are set.

- **Reactivate:** Use **Reactivate** on a deactivated user.  
  - **Backend:** `PATCH` with `deactivated_at: null`.  
  - **Auth:** Ban is cleared (`ban_duration: "0"`).  
  - User can log in again.

- **Rules:** Super admins cannot deactivate (or delete) other super admins.

### Delete (admin) — full compliance purge

- **Where:** Admin → **Users** → user detail → **Actions** → **Purge account & data** (superadmin only).  
- **API:** `DELETE /api/admin/users/[id]` — requires **superadmin**; runs DB function `compliance_clear_user_references` (migration `440_compliance_clear_user_references.sql`), removes chat attachment files from storage, then `auth.admin.deleteUser` (cascades `public.users` and most dependent rows).  
- **Rules:** Cannot delete yourself or another superadmin. Deletion is permanent.

### Purge provider organization (admin)

- **Where:** Admin → **Providers** → provider detail → **Compliance: purge provider organization** (superadmin only).  
- **API:** `POST /api/admin/compliance/purge-provider` with body `{ provider_id, confirmation: "PURGE PROVIDER ORG", reason? }`.  
- Deletes linked staff Auth accounts (each full user purge), then the owner account, which removes the provider row and cascaded business data. Refuses superadmin-owned providers.

---

## 2. Self-service: deactivation and deletion

### Deactivation (user)

- **Web:** Account settings → Login & security → **Deactivate** (password + optional reason).  
  - Calls `POST /api/me/deactivate` (password required).  
  - Backend sets `users.deactivated_at`, then **signs out** the user (Supabase `signOut`).  
  - The backend does **not** ban the Supabase auth user for self-service deactivation (only `users.deactivated_at` is set).  
  - **Reactivation:** To allow “reactivate by logging in”, you can add a `deactivated_by` flag (`'user' | 'admin'`) and, on next successful login, clear `deactivated_at` when `deactivated_by === 'user'`; otherwise the **AccountStatusGuard** will keep signing the user out when it sees `is_deactivated`. Alternatively, provide a “Reactivate account” link (e.g. in email) or support flow that clears `deactivated_at`.

- **Provider app:** Settings → Account → **Deactivate account** → in-app screen (password, optional reason, confirmation).  
  - Calls same `POST /api/me/deactivate`.  
  - On success, app **signs out** and redirects to login.  
  - Styled as **destructive** (red) in the Account list.

- **Customer app (Expo):** Uses the same **`AccountStatusGuard`** as the provider app (see §3). **Self-service deactivation** is in **Account → Login & security → Deactivate account** (password + optional reason), calling `POST /api/me/deactivate`, then sign-out → login with deactivated messaging. Same API and behaviour as web.

### Deletion (user)

- **Web:** Account settings → Privacy and sharing → **Delete account**.  
  - To avoid accidental deletion, the user must:  
    - Enter their **password**.  
    - Type the word **DELETE** (exact, case-insensitive) in a confirmation field.  
  - Dialog copy states that deletion is permanent (bookings, messages, profile, etc.) and suggests “Deactivate account” in Login & security if they only want a break.  
  - Then calls `POST /api/me/delete-account`; backend sets `account_deletion_requested_at` and performs permanent deletion.  
- **Customer app:** **Account → Privacy & sharing → Delete account** opens a dedicated screen: password, optional reason, type **DELETE**, then confirmation alert; calls `POST /api/me/delete-account` and signs the user out (parity with web, not browser-only).  
- **Provider app:** **Delete account** in Settings → Account is an in-app flow on **delete-account-info** (password + optional reason); or web parity paths as documented for your build.  
  - **Destructive** styling in account lists where applicable.

---

## 3. How status is enforced across the platform

### API: account status

- **`GET /api/me/account-status`**  
  Returns for the current user (by session):  
  - `is_deactivated`, `deactivated_at` (from `users.deactivated_at`),  
  - `is_suspended`, `suspension_reason`, etc. (from provider suspension, if applicable).  
  Used by web, customer app, and provider app to decide redirect and messaging.

### Customer app (Expo)

- **`AccountStatusGuard`** in `app/(app)/_layout.tsx` (inside `MaintenanceGate`, wrapping `RoleGate`):  
  - After a session exists, calls `GET /api/me/account-status` via the customer API client (`Bearer` token).  
  - If **suspended** → sign out, redirect to `/(auth)/login?suspended=1`.  
  - If **deactivated** → sign out, redirect to `/(auth)/login?deactivated=1` (with the same self-service **reactivate** attempt via `POST /api/me/reactivate-account` when `deactivated_by === 'user'` as on web/provider).  
- **Login** shows an inline banner when `suspended=1` or `deactivated=1` is present on the route.

### Web (Next.js)

- **AccountStatusGuard** (wraps authenticated app shell):  
  - Calls `GET /api/me/account-status`.  
  - If **suspended** → redirect to `/account-suspended`.  
  - If **deactivated** → **sign out** (clear client auth state), then redirect to `/?deactivated=true`.  
  - Ensures deactivated users cannot stay “logged in” on the client.

### Provider app (Expo)

- **AccountStatusGuard** in `(app)/_layout.tsx`:  
  - After session exists, calls `GET /api/me/account-status` (via provider API client).  
  - If **suspended** → sign out, redirect to `/(auth)/login?suspended=1`.  
  - If **deactivated** → sign out, redirect to `/(auth)/login?deactivated=1`.  
- **Login screen** reads `deactivated` / `suspended` query params and shows a **status message** (e.g. “Your account has been deactivated. Contact support to reactivate.” / “Your account has been suspended…”).

### Auth (Supabase)

- When **super admin deactivates**, the auth user is **banned**, so all existing tokens become invalid (on next refresh/use).  
- When **user self-deactivates**, the backend signs them out; if you do not ban the auth user, they can log in again to reactivate.  
- **Deletion** removes or anonymises the user and related data; auth user is removed as per your delete-account implementation.

---

## 4. Destructive styling (provider app)

In **Settings → Account** in the provider app, these items use **destructive** (red) styling so they stand out and match store expectations:

- **Deactivate account**  
- **Delete account**  
- **Sign out**

Same styling pattern (red text/background, clear labels) is used for consistency and to avoid accidental taps.

---

## 5. Summary table

| Action              | Who        | Where (web)                    | Where (customer app)                 | Where (provider app)              | Backend / auth behaviour |
|---------------------|------------|--------------------------------|--------------------------------------|-----------------------------------|---------------------------|
| Deactivate (admin)  | Super admin| Admin → Users → Deactivate     | N/A                                  | N/A                               | Set `deactivated_at`, ban auth user |
| Reactivate (admin)  | Super admin| Admin → Users → Reactivate     | N/A                                  | N/A                               | Clear `deactivated_at`, unban |
| Deactivate (self)   | User       | Account → Login & security     | Account → Login & security → Deactivate | Settings → Account → Deactivate   | Set `deactivated_at`, sign out |
| Delete (self)       | User       | Account → Privacy → Delete     | Account → Privacy → Delete account   | Settings → Account → Delete (in-app) | Deletion flow + data removal |
| Delete (admin)      | Super admin| Admin → Users → Delete        | N/A                                  | N/A                               | Permanent delete user/data |

Enforcement is consistent: **AccountStatusGuard** on web, in the **customer** app, and in the **provider** app ensures deactivated (and suspended provider org) users are signed out and redirected, with clear messaging on the **customer** and **provider** login screens when they land with `?deactivated=1` or `?suspended=1`.
