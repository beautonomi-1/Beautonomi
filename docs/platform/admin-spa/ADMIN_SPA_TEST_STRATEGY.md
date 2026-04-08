# ADMIN_SPA_TEST_STRATEGY

**Purpose:** Define **objective quality gates** so “migrated” is provable, not subjective. After migration, this strategy is the **binding test bar** for new admin work — see [`ADMIN_PLATFORM_GOVERNANCE.md`](./ADMIN_PLATFORM_GOVERNANCE.md) **§4**.

**Owner:** QA lead (owns suite); FE lead (owns unit/component); EM (owns CI gates). **Accountability matrix:** governance **§1**.

---

## 1. Test pyramid (admin SPA)

| Layer | Scope | Tools (recommended) | When |
|-------|--------|---------------------|------|
| **Unit** | Parsers, hooks, **query key factories**, admin client URL builders, Zod schemas | Vitest | Every PR touching logic |
| **Component** | Tables, filter bars, permission gates | Vitest + Testing Library | Key shared components |
| **Integration** | Router + shell + mocked API | MSW + Vitest | Shell changes |
| **E2E** | Critical paths staging | Playwright | Nightly + pre-cutover |
| **Contract** | API response shape | Zod fixtures / schemathesis (optional) | Per wave exit |

---

## 2. Mandatory suites

### 2.1 Route smoke (`admin-smoke`)

- **Scope:** Every migrated route returns **200 shell**, no uncaught errors, bootstrap succeeds.  
- **Frequency:** Every deploy to staging.  
- **Auth matrix:** Run **twice** per release candidate — `superadmin` + one **section-limited** role (e.g. `admin_finance`).

### 2.2 Role / permission (`admin-rbac`)

- For each **section**, at least one **positive** path (can open allowed page) and one **negative** path (403 UI on forbidden page).  
- Data from `ADMIN_API_PARITY_MATRIX.md` AuthZ column.

### 2.3 Critical CRUD E2E (minimum set)

| Area | Minimum flows |
|------|----------------|
| Providers | List → open detail → status change (if exists) |
| Bookings | List → open detail |
| Support | List → open ticket → add note (if API exists) |
| Payouts | List → approve or mark-paid (staging data) |
| Users | Search → open user |

Expand in **Wave exit** checklists.

### 2.4 Pagination / filter / sort

- Any page that had **server-side** pagination in legacy must have **E2E or integration** test proving **query params** match API (page, limit, sort, filters).

### 2.5 Loading / empty / error

- Component or E2E: **skeleton** while loading; **empty state** copy; **error** retry for simulated 500.

### 2.6 Responsive

- Playwright projects: `viewport: { width: 375, height: 812 }` and `1280x800` for **M1** pages.  
- Screenshot comparison **optional** (Percy/Chromatic) for **shell + one reference page per wave**.

### 2.7 Foundation primitives (admin-web)

- **Query keys:** When adding a new `adminQueryKeys` factory (or changing key shape), extend `apps/admin-web/src/lib/adminQueryKeys.test.ts` so cache keys and invalidation targets stay predictable.  
- **Pure helpers** (`buildSupportTicketsSearchParams`, legacy path builders, `cn`, etc.) stay covered at unit level; **do not** duplicate E2E for every page if the same primitive is reused.
- **Envelopes:** Pages that call `adminApi.getRawJson` (payouts, audit logs) should have **integration or smoke** coverage once those routes are wave-gated **Reviewed**, so `meta` pagination cannot regress silently.

---

## 3. CI gates (opinionated)

| Gate | Blocks merge when |
|------|-------------------|
| `admin-web-unit` | Failing Vitest |
| `admin-web-lint-typecheck` | ESLint / tsc errors |
| `admin-smoke-staging` | Failing on `main` nightly (warn) / **blocks cutover** if failing |

---

## 4. Pre-cutover release regression

**Timing:** Within 24h before production flag flip.

- Full `admin-smoke` + full `admin-rbac` + **full critical CRUD list** on **staging** with **SPA flag ON**.  
- **API error rate** dashboard reviewed (baseline ± threshold).  
- **Sign-off:** QA lead in `ADMIN_SPA_WAVE_TRACKER.md` or release ticket.

---

## 5. Quality gate checklist (attach to PR template)

```markdown
- [ ] ADMIN_API_PARITY_MATRIX row updated / Reviewed
- [ ] ADMIN_SPA_WAVE_TRACKER status updated
- [ ] Unit tests for new client methods / parsers
- [ ] Role test added if new page
- [ ] Responsive class verified (M1–M4)
```

**Full reviewer checklist:** [`ADMIN_PLATFORM_GOVERNANCE.md`](./ADMIN_PLATFORM_GOVERNANCE.md) **§2.2** (includes lazy routes, PM visibility for behavior changes).

---

## 6. New or changed pages (post-migration minimum)

| Change | Minimum test artifact |
|--------|------------------------|
| New **`adminQueryKeys`** segment | Extend **`adminQueryKeys.test.ts`** |
| New page with section gate | **`admin-rbac`** plan coverage (staging E2E or documented integration) |
| New **`/api/admin/*` consumer** | Matrix row + contract/integration per §2.4 / §2.7 |
| P0 domain touch | Extend **critical CRUD** set (§2.3) with EM approval |

---

## 7. Changelog

| Date | Change |
|------|--------|
| 2026-04-05 | Governance link, §6 post-migration page minimums, PR checklist cross-ref |
| 2026-04-05 | §2.7 `getRawJson` / envelope coverage expectation (payouts, audit logs) |
| 2026-04-05 | §2.7 foundation / `adminQueryKeys` unit-test expectation |
| | Initial |
