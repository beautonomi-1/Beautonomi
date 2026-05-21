# Account security & compliance purge — QA checklist

End-to-end verification for:

1. **Admin compliance user purge** (migration `619_compliance_clear_user_references_dynamic_fk_blockers.sql`)
2. **Passwordless deactivate / delete** (OTP reauthentication vs password)

## Prerequisites

- Web API running (`pnpm dev:web` or deployed environment).
- Supabase migrations applied through **619** (purge RPC) on the target project.
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
| `Database error deleting user` (500) | Migration **619** not applied, or new FK not covered by dynamic sweep |
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
| 2.2 | Tap Send code | Email/SMS OTP arrives (Supabase reauthenticate) |
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

- Web: Privacy → Delete account.
- Mobile: Delete account screen + type `DELETE`.
- `POST /api/me/delete-account` runs `purgePlatformUserAccountFully` (FK clear + storage + auth delete).

| Step | Expected |
|------|----------|
| 3.1 | OTP-only account completes delete | 200, signed out, cannot log in |
| 3.2 | User with blocking FKs | No generic 500; message mentions support if `AUTH_DELETE_DATABASE_ERROR` |

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

- [ ] Migration **619** applied on staging/production
- [ ] Automated test commands green
- [ ] Admin purge succeeded for tenant-scoped user
- [ ] OTP-only deactivate on customer + provider + web
- [ ] Password deactivate on account with password
- [ ] Self-service delete (OTP + password) without `Database error deleting user`
