# Account security & compliance purge — QA checklist

End-to-end verification for:

1. **Admin compliance user purge** (migrations `619`, `631`, `653` — dynamic FK cleanup + provider-owner chains)
2. **Passwordless deactivate / delete** (OTP reauthentication vs password)

## Prerequisites

- Web API running (`pnpm dev:web` or deployed environment).
- Supabase migrations applied through **653** on the target project (minimum **619** for dynamic user FK sweep; **631** deletes owned-provider bookings; **653** clears provider/offerings RESTRICT chains before `auth.admin.deleteUser`).
- Superadmin account for admin SPA purge tests.
- Test accounts:
  - **A:** Email OTP only (no password set).
  - **B:** Email + password signup.
  - **C:** User in tenant **T** with booking or provider link (for scoped admin purge).

## Automated checks (CI-local)

```bash
pnpm --filter @beautonomi/utils build
pnpm --filter @beautonomi/utils test
pnpm --filter @beautonomi/admin-api-client test
pnpm --filter web exec vitest run \
  src/lib/account/purge-platform-user.test.ts \
  src/lib/auth/validate-sensitive-action-input.test.ts \
  src/app/api/me/delete-account/__tests__/route.test.ts \
  src/__tests__/api/compliance-reset-tenant.test.ts
pnpm --filter web typecheck
```

All should pass before manual QA.

---

## 1. Admin purge user (Vite admin SPA)

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Log in as superadmin, set tenant picker to tenant **T** | `localStorage` has `admin_scope_mode=tenant` and `admin_scope_tenant_id=<T>` |
| 1.2 | Users list → Purge user in scope **T** | Request URL includes `?scope=tenant&tenant_id=<T>` |
| 1.3 | Complete dialog: reason ≥20 chars, email match, phrase `DELETE USER FOREVER` | `POST /api/admin/compliance/purge-user` → **200**, report JSON returned |
| 1.4 | User removed from list; auth user gone | No row in `public.users`; login fails for that email |
| 1.5 | Repeat purge on user with many FKs (bookings, support, payments) | No `Database error deleting user`; audit row in `compliance_purge_audit_log` |

**Failure modes**

| Symptom | Likely cause |
|---------|----------------|
| `Database error deleting user` (500) | Migrations **619** / **631** / **653** not applied, or new FK not covered by dynamic sweep |
| `User not found in this tenant scope` (404) | Wrong tenant picker; user has no booking/provider/home-tenant link to **T** |
| `AUTH_DELETE_DATABASE_ERROR` in API body | Same as first row — check Supabase logs + run RPC manually |

**SQL smoke test (optional, staging only)**

```sql
SELECT public.compliance_clear_user_references('<user-uuid>'::uuid);
-- Then delete via Dashboard or auth.admin.deleteUser in a controlled test.
```

---

## 2. Passwordless deactivate (customer / provider / web)

| Step | Surface | Expected UI |
|------|---------|-------------|
| 2.1 | Account → Deactivate (OTP-only account **A**) | After profile loads: **Send verification code** + code field, **not** password |
| 2.2 | Tap Send code | UI names channel (masked email or SMS); OTP arrives via Supabase `reauthenticate` (email first, else phone) |
| 2.3 | Enter OTP + optional reason → Deactivate | `POST /api/me/deactivate` **200**, signed out, reactivate banner on login |
| 2.4 | Account **B** (has password) | Password field shown; OTP path not required |
| 2.5 | Submit empty on **A** before code | Client blocks submit; server returns 400 if bypassed |
| 2.6 | Submit password only on **A** (API tamper) | 400: account has no password, use verification code |

**API contract**

- Body: `{ password?, verificationNonce?, reason? }` (also accepts `verification_nonce`).
- `GET /api/me/profile` → `auth_security.has_password` must be **false** for OTP-only accounts.

---

## 3. Passwordless delete account

Same as §2, but:

- Web: Privacy → Delete account (password or OTP + type `DELETE`).
- Mobile: Delete account screen + type `DELETE`.
- `POST /api/me/delete-account` runs `purgePlatformUserAccountFully` (FK clear + storage + auth delete). Pre-update `account_deletion_requested_at` is **best-effort** (failure must not block purge — same as admin purge path).

| Step | Expected |
|------|----------|
| 3.1 | OTP-only account completes delete | 200, signed out, cannot log in |
| 3.2 | User with blocking FKs | No `Could not start account deletion`; message mentions support if `AUTH_DELETE_DATABASE_ERROR` |
| 3.3 | **Provider owner** (OTP-only) on provider app | Send-code copy shows email or SMS destination; delete **200**; business data removed; no pre-update-only 500 |
| 3.4 | Ops notification (Slack configured) | Slack receives `compliance.account_deletion.succeeded` or `.failed` (fallback: `dispute.new` channel); Admin → Compliance purge audit lists successful self-service purges |

### Ops notification (self-service delete)

On every verified `POST /api/me/delete-account` attempt (success or purge failure):

1. **Slack** — `compliance.account_deletion.succeeded` or `compliance.account_deletion.failed` via `tryNotifySlackEvent`. Configure in Admin SPA → Integrations → Slack, or rely on fallback routing to `dispute.new` if that channel is already enabled.
2. **`audit_logs`** — `user.account.self_service_delete` (succeeded/failed) for platform audit retention.
3. **`compliance_purge_audit_log`** — on **success only**, immutable row (`purge_type: user`, `actor_user_id` null) visible under Admin → Control plane → Compliance.

Failures still notify ops so support can assist or run admin compliance purge.

---

## 4. Regression matrix

| Feature | Web | Customer app | Provider app | Admin SPA |
|---------|-----|--------------|--------------|-----------|
| Deactivate password | ✓ | ✓ | ✓ | N/A |
| Deactivate OTP | ✓ | ✓ | ✓ | N/A |
| Delete password | ✓ | ✓ | ✓ | N/A |
| Delete OTP | ✓ | ✓ | ✓ | N/A |
| Purge user | Legacy Next dialog | N/A | N/A | ✓ Users list modal |
| Tenant-scoped purge | N/A | N/A | N/A | ✓ `scope=tenant` on URL |

---

## 5. Sign-off

- [ ] Migrations **619**, **631**, and **653** applied on staging/production
- [ ] Automated test commands green (includes `delete-account` route tests)
- [ ] Admin purge succeeded for tenant-scoped user
- [ ] OTP-only deactivate on customer + provider + web (UI shows masked email/SMS destination)
- [ ] Password deactivate on account with password
- [ ] Provider owner OTP delete on provider app (no `Could not start account deletion`)
- [ ] Slack routing enabled for `compliance.account_deletion.*` (or `dispute.new` fallback) and message received on delete
- [ ] Self-service delete (OTP + password) without `Database error deleting user`
