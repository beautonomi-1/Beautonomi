# Account deactivation and deletion – platform overview

How account **deactivation** and **deletion** are managed by **super admins** and by **users**, and how the platform enforces status everywhere (web, provider app).

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

### Delete (admin)

- **Where:** User detail (and possibly bulk) **Delete** action.  
- **API:** `DELETE /api/admin/users/[id]`.  
- **Rules:** Cannot delete other super admins. Deletion is permanent (user and related data removed or anonymised as per implementation).

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

### Deletion (user)

- **Web:** Account settings → Privacy and sharing → **Delete account**.  
  - To avoid accidental deletion, the user must:  
    - Enter their **password**.  
    - Type the word **DELETE** (exact, case-insensitive) in a confirmation field.  
  - Dialog copy states that deletion is permanent (bookings, messages, profile, etc.) and suggests “Deactivate account” in Login & security if they only want a break.  
  - Then calls `POST /api/me/delete-account`; backend sets `account_deletion_requested_at` and performs permanent deletion.  
- **Provider app:** **Delete account** in Settings → Account shows an **Alert** first: “This will open the website where you can permanently delete your account and all your data. This cannot be undone. Continue?” → **Open website** opens `/account-settings/privacy-and-sharing`.  
  - **Destructive** styling in the Account list.

---

## 3. How status is enforced across the platform

### API: account status

- **`GET /api/me/account-status`**  
  Returns for the current user (by session):  
  - `is_deactivated`, `deactivated_at` (from `users.deactivated_at`),  
  - `is_suspended`, `suspension_reason`, etc. (from provider suspension, if applicable).  
  Used by web and provider app to decide redirect and messaging.

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

| Action              | Who        | Where (web)                    | Where (provider app)              | Backend / auth behaviour |
|---------------------|------------|--------------------------------|-----------------------------------|---------------------------|
| Deactivate (admin)  | Super admin| Admin → Users → Deactivate     | N/A                               | Set `deactivated_at`, ban auth user |
| Reactivate (admin)  | Super admin| Admin → Users → Reactivate     | N/A                               | Clear `deactivated_at`, unban |
| Deactivate (self)   | User       | Account → Login & security     | Settings → Account → Deactivate   | Set `deactivated_at`, sign out |
| Delete (self)       | User       | Account → Privacy → Delete     | Settings → Account → Delete (→ web) | Deletion flow + data removal |
| Delete (admin)      | Super admin| Admin → Users → Delete        | N/A                               | Permanent delete user/data |

Enforcement is consistent: **AccountStatusGuard** on web and in the provider app ensures deactivated (and suspended) users are signed out and redirected, with a clear message on the provider login screen when they land with `?deactivated=1` or `?suspended=1`.
