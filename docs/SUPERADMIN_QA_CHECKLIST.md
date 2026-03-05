# Superadmin Portal – QA Verification Checklist

Use this checklist to verify the Superadmin portal is production-ready. Run as a superadmin user unless otherwise noted.

---

## 0. Role & access

- [ ] **0.1** Log in as a **non–superadmin** (e.g. customer or provider). Visit `/admin` or `/admin/dashboard`. Expect: **redirect to `/`** (or login) before admin UI is shown (middleware/proxy).
- [ ] **0.2** Log in as **superadmin**. Visit `/admin`. Expect: redirect to `/admin/dashboard` and full admin shell (sidebar, nav).
- [ ] **0.3** While logged in as superadmin, call an admin API without a valid session (e.g. from another browser/incognito). Expect: **401/403** from API.

---

## 1. Overview

| #   | Page            | Path                  | Verify |
|-----|-----------------|------------------------|--------|
| 1.1 | Dashboard       | `/admin/dashboard`     | Loads; stats (users, providers, bookings, revenue) show real numbers or loading → empty; no crash. |
| 1.2 | Gods Eye       | `/admin/gods-eye`      | Loads; data or empty state. |
| 1.3 | Analytics      | `/admin/analytics`     | Loads; charts or empty. |
| 1.4 | Reports hub     | `/admin/reports`       | Cards for Revenue, Bookings, Providers, Customers, Gift Cards; each link works. |

---

## 2. Reports (one action per report)

| #   | Page            | Path                           | Action to try |
|-----|-----------------|---------------------------------|---------------|
| 2.1 | Revenue         | `/admin/reports/revenue`        | Pick period; view report; **Export** (CSV/PDF if offered) downloads. |
| 2.2 | Bookings        | `/admin/reports/bookings`      | Apply filters; **Export** works. |
| 2.3 | Providers       | `/admin/reports/providers`     | View; **Export** works. |
| 2.4 | Customers       | `/admin/reports/customers`     | View report. |
| 2.5 | Gift cards      | `/admin/reports/gift-cards`    | View report. |

---

## 3. Providers & operations

| #   | Page             | Path                            | Action to try |
|-----|------------------|----------------------------------|---------------|
| 3.1 | Providers list   | `/admin/providers`              | Load list; search/filter; open one provider. |
| 3.2 | Provider detail  | `/admin/providers/[id]`         | View; change status (e.g. approve/suspend) if available; **toast + UI update**. |
| 3.3 | Distance settings| `/admin/providers/distance-settings` | Load; save if form exists. |
| 3.4 | Staff            | `/admin/staff`                  | Load; edit role or reset password; **toast + refetch**. |
| 3.5 | Bookings         | `/admin/bookings`               | Load; pagination/filter; open one booking. |
| 3.6 | Booking detail   | `/admin/bookings/[id]`          | View; **Cancel** or **Refund** if offered; **toast + state update**. |
| 3.7 | Reviews          | `/admin/reviews`                | Load; hide/flag if actions exist; **toast**. |
| 3.8 | Disputes         | `/admin/disputes`               | Load; resolve one dispute; **toast + list update**. |
| 3.9 | User reports     | `/admin/user-reports`           | Load list; open/dismiss if actions exist. |
| 3.10| Refunds          | `/admin/refunds`                | Load; approve/reject if actions exist; **toast**. |
| 3.11| Support tickets  | `/admin/support-tickets`        | Load; open one ticket. |
| 3.12| Ticket detail    | `/admin/support-tickets/[id]`   | Reply or add note; **toast + message appears**. |

---

## 4. Finance

| #   | Page              | Path                                  | Action to try |
|-----|-------------------|----------------------------------------|---------------|
| 4.1 | Finance           | `/admin/finance`                       | Load summary/transactions. |
| 4.2 | Payouts           | `/admin/payouts`                      | Load; **Approve** / **Reject** / **Mark paid** one (if available); **toast**. |
| 4.3 | Fee management    | `/admin/fees`                         | Load configs; add/edit fee config; **toast**. |
| 4.4 | Platform fees     | `/admin/settings/platform-fees`       | Load; save; **toast**. |
| 4.5 | Taxes             | `/admin/taxes`                        | Load; add/edit tax rate; **toast**. |
| 4.6 | Plans             | `/admin/plans`                        | Load (or redirect). |
| 4.7 | Provider subs     | `/admin/provider-subscriptions`       | Load list. |
| 4.8 | Subscription rev  | `/admin/subscription-revenue`        | Load metrics. |
| 4.9 | Billing           | `/admin/billing`                     | Load; mark invoice “sent” if action exists; **toast**. |

---

## 5. Users & trust

| #   | Page           | Path                     | Action to try |
|-----|----------------|--------------------------|---------------|
| 5.1 | Users          | `/admin/users`           | Load; search; change role (e.g. to provider_owner); **toast + row update**. |
| 5.2 | User detail    | `/admin/users/[id]`      | View; **Impersonate** (if present)—confirm redirect and audit; **Export** downloads. |
| 5.3 | Verifications  | `/admin/verifications`   | Load; **Approve** or **Reject** one; **toast + list update**. |
| 5.4 | Audit logs     | `/admin/audit-logs`      | Load; filters; **Export** (if offered) downloads. |

---

## 6. Content & catalog

| #   | Page      | Path                   | Action to try |
|-----|-----------|------------------------|---------------|
| 6.1 | Content   | `/admin/content`       | Switch tabs (FAQs, Pages, Footer, etc.); edit one item; **toast + refetch**. |
| 6.2 | Catalog   | `/admin/catalog`       | Add/edit global category; **toast**. |
| 6.3 | Explore   | `/admin/explore`       | Load; approve/remove post if actions exist; **toast**. |

---

## 7. E‑commerce

| #   | Page            | Path                             | Action to try |
|-----|-----------------|-----------------------------------|---------------|
| 7.1 | Product orders  | `/admin/ecommerce/orders`        | Load list; open one. |
| 7.2 | Product returns| `/admin/ecommerce/returns`        | Load; approve/reject one; **toast**. |
| 7.3 | Product catalog | `/admin/ecommerce/products`       | Load. |

---

## 8. Marketing & comms

| #   | Page                 | Path                              | Action to try |
|-----|----------------------|------------------------------------|---------------|
| 8.1 | Promotions           | `/admin/promotions`               | Load; create/edit one; **toast**. |
| 8.2 | Loyalty              | `/admin/loyalty`                  | Load; add/edit milestone or rule; **toast**. |
| 8.3 | Point rules          | `/admin/gamification/point-rules` | Load; save if form exists. |
| 8.4 | Badges               | `/admin/gamification/badges`      | Load; add/edit badge; **toast**. |
| 8.5 | Gift cards           | `/admin/gift-cards`               | Load; create/edit one; **toast**. |
| 8.6 | Notifications       | `/admin/notifications`            | Send test (if offered); **toast**. |
| 8.7 | Broadcast            | `/admin/broadcast`                | Load; send push/email/SMS if form exists; **toast**. |
| 8.8 | Automations          | `/admin/automations`              | Load. |
| 8.9 | Notification templates | `/admin/notification-templates` | Load; add/edit template; **toast**. |

---

## 9. Integrations & dev

| #   | Page      | Path                             | Action to try |
|-----|-----------|-----------------------------------|---------------|
| 9.1 | Webhooks  | `/admin/webhooks`                | Load; add endpoint; **Test**; **toast**. |
| 9.2 | API keys  | `/admin/api-keys`                | Load; create/revoke key; **toast**. |
| 9.3 | Amplitude | `/admin/integrations/amplitude`  | Load; save config; **toast**. |
| 9.4 | Mapbox    | `/admin/mapbox`                  | Load; save config or service zone; **toast**. |
| 9.5 | ISO codes | `/admin/iso-codes`               | Load tabs; add/edit language or country; **toast**. |

---

## 10. Operations & platform config

| #   | Page           | Path                                   | Action to try |
|-----|----------------|-----------------------------------------|---------------|
| 10.1| System health  | `/admin/system-health`                  | Load; no crash. |
| 10.2| Monitoring     | `/admin/monitoring`                     | Load. |
| 10.3| Security       | `/admin/security`                      | Load; update 2FA or copy settings; **toast**. |
| 10.4| Settings       | `/admin/settings`                      | Load; change one setting; **toast**. |
| 10.5| Feature flags  | `/admin/settings/feature-flags`         | Toggle one flag; **toast**. |
| 10.6| Subscription plans | `/admin/subscription-plans`        | Load; add/edit plan; **toast**. |
| 10.7| Addons         | `/admin/addons`                        | Load (superadmin or provider_owner). |
| 10.8| Control plane  | `/admin/control-plane`                 | Overview; open sub-pages (AI, Ads, Safety, etc.); no crash. |

---

## 11. Audit & compliance

- [ ] **11.1** After changing a user role, approving a provider, or processing a refund, open **Audit logs** and confirm an entry for that action (actor, entity, action type).
- [ ] **11.2** If impersonation is used, confirm an audit log entry for impersonation start (and end if applicable).

---

## 12. Exports & bulk actions

- [ ] **12.1** From **Audit logs**, run **Export**; file downloads (CSV or PDF).
- [ ] **12.2** From **Reports** (Revenue / Bookings / Providers), run **Export**; file downloads.
- [ ] **12.3** On **Users** or **Bookings**, select multiple rows and run a **bulk action** (if offered); **toast** and list updates.

---

## Sign-off

| Phase        | Done by | Date | Notes |
|-------------|---------|------|--------|
| Role & access (0) |         |      | |
| Overview (1)     |         |      | |
| Reports (2)      |         |      | |
| Providers & ops (3) |       |      | |
| Finance (4)      |         |      | |
| Users & trust (5) |         |      | |
| Content & catalog (6) |     |      | |
| E‑commerce (7)   |         |      | |
| Marketing (8)    |         |      | |
| Integrations (9) |         |      | |
| Operations (10)  |         |      | |
| Audit (11)       |         |      | |
| Exports & bulk (12) |       |      | |

---

*Generated from Superadmin audit. Update this checklist when adding or removing admin sections.*
