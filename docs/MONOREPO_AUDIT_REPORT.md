# Beautonomi Monorepo Audit Report

**Date:** 2026-02-14

## Executive Summary

Audit of pnpm workspaces, Turborepo tasks, apps/web build/routes, import aliases, and secrets in shared packages. Several issues were identified and fixes applied.

---

## 1. pnpm Workspaces & Turborepo Tasks

### Verified

| Item | Status |
|------|--------|
| `pnpm-workspace.yaml` | ✓ Packages: `apps/*`, `packages/*`, `tooling/*` |
| `turbo.json` tasks | ✓ `build`, `dev`, `lint`, `typecheck`, `test`, `clean` |
| Root scripts | ✓ `dev:web`, `typecheck`, `lint`, `test` invoke turbo |
| Package scripts | ✓ web has dev, build, lint, typecheck, test; customer/provider have dev, typecheck, lint |

### Issues

1. **Turbo EPERM on Windows** – Running `pnpm exec turbo run dev --filter=web` (or typecheck/lint) may fail with `spawnSync turbo.exe EPERM`. This appears to be an environment/PowerShell/permissions issue rather than code.
   - **Workaround:** Run tasks directly in each app:
     ```powershell
     cd apps\web; npx pnpm run typecheck
     cd apps\web; npx pnpm run lint
     cd apps\web; npx pnpm run test:run
     ```

---

## 2. apps/web Build & Routes

### Verified

- `next build` starts successfully.
- Route types are generated (e.g. `.next/types/routes.d.ts`).

### Fixes Applied

- **Analytics route security:** `/api/public/analytics-config` now explicitly picks only safe fields (`api_key_public`, etc.) before returning JSON, so `api_key_server` is never leaked even if the DB returns it.

---

## 3. Import Path Aliases

### Verified

| Location | Alias | Resolution |
|----------|-------|------------|
| `apps/web/tsconfig.json` | `@/*` → `./src/*` | ✓ |
| `apps/web/vitest.config.ts` | `@` → `./src` | ✓ |
| Workspace packages | `@beautonomi/types`, `@beautonomi/api`, `@beautonomi/ui-tokens`, etc. | ✓ via `workspace:*` |

No package path-alias mismatches were found.

---

## 4. Secrets in Shared Packages

### Verified

- `packages/config/src/env.ts` – Contains only type definitions (`BeautonomiEnv`); no hardcoded secrets.
- No `.env` or credential files found in `packages/*`.

---

## 5. Issues & Exact Fixes

### Issue 1: Analytics-config test used Jest (project uses Vitest)

**File:** `apps/web/src/app/api/public/analytics-config/__tests__/route.test.ts`

**Problem:** `jest.mock()`, `jest.fn()`, `jest.clearAllMocks()` cause `ReferenceError: jest is not defined`.

**Fix:** Switch to Vitest APIs:
- `jest.mock` → `vi.mock`
- `jest.fn()` → `vi.fn()`
- `jest.clearAllMocks()` → `vi.clearAllMocks()`
- `(x as jest.Mock)` → `(x as ReturnType<typeof vi.fn>)`

---

### Issue 2: next lint removed in Next.js 16 / directory error

**File:** `apps/web/package.json`

**Problem:** `next lint` is removed in Next.js 16. Legacy `next lint` can fail with:
```
Invalid project directory provided, no such directory: .../apps/web/lint
```

**Fix:**
1. Create `apps/web/eslint.config.mjs` using ESLint 9 flat config and `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`.
2. Change lint script from `"next lint"` to `"eslint ."`.

**New file:** `apps/web/eslint.config.mjs`:

```javascript
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**"]),
]);

export default eslintConfig;
```

---

### Issue 3: Analytics route could leak server keys

**File:** `apps/web/src/app/api/public/analytics-config/route.ts`

**Problem:** If Supabase returned extra fields (e.g. `api_key_server`), the route would pass them through. The test expected `api_key_server` to be stripped.

**Fix:** Build an explicit safe config object before returning:

```ts
const safeConfig = {
  api_key_public: data.api_key_public,
  environment: data.environment,
  enabled_client_portal: data.enabled_client_portal,
  enabled_provider_portal: data.enabled_provider_portal,
  enabled_admin_portal: data.enabled_admin_portal,
  guides_enabled: data.guides_enabled,
  surveys_enabled: data.surveys_enabled,
  sampling_rate: data.sampling_rate,
  debug_mode: data.debug_mode,
};
return NextResponse.json(safeConfig, { ... });
```

---

### Issue 4: customer/provider lack test script

**Status:** Not an error. Turbo skips workspaces without a `test` script; only `web` runs tests.

---

## Commands to Verify

Run from repo root or `apps/web`:

```powershell
# From root (if turbo works)
npx pnpm dev:web
npx pnpm typecheck
npx pnpm lint
npx pnpm test

# Per-app fallback (Windows)
cd apps\web
npx pnpm run typecheck
npx pnpm run lint
npx pnpm run test:run
npx pnpm run build
```

---

## Summary of Changes Made

| File | Change |
|------|--------|
| `apps/web/src/app/api/public/analytics-config/__tests__/route.test.ts` | Jest → Vitest (`vi.mock`, `vi.fn`, etc.) |
| `apps/web/src/app/api/public/analytics-config/route.ts` | Explicit safe config object to avoid leaking server keys |
| `apps/web/package.json` | `lint`: `next lint` → `eslint .` |
| `apps/web/eslint.config.mjs` | **New** – ESLint 9 flat config with Next.js rules |
