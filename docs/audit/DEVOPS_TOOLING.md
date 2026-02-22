# DevOps & Tooling Audit

> Generated: 2026-02-17

## Monorepo Structure

```
beautonomi/
├── apps/
│   ├── web/          # Next.js 15 (provider portal + customer portal + superadmin)
│   ├── customer/     # Expo React Native (customer mobile app)
│   └── provider/     # Expo React Native (provider mobile app)
├── packages/
│   ├── api/          # Shared API client (apiFetch, createApiClient)
│   ├── analytics/    # Amplitude integration
│   ├── config/       # Environment config types (UNUSED)
│   ├── types/        # Shared TypeScript types + parity contracts
│   ├── ui-tokens/    # Design tokens + Tailwind preset
│   └── utils/        # Date, money, slug utilities (UNUSED)
├── tooling/
│   ├── eslint-config/      # EMPTY placeholder
│   ├── typescript-config/  # Shared tsconfig presets
│   ├── expo-dev/           # Port-safe Expo runner, env init
│   ├── audit/              # Route scanner (this audit)
│   └── parity/             # Mobile parity checker
├── beautonomi/       # Legacy standalone app (pre-monorepo)
├── beautonomi1/      # Another legacy copy
├── turbo.json        # Turborepo task config
├── pnpm-workspace.yaml
└── package.json      # Root scripts
```

---

## Turborepo Configuration

**File:** `turbo.json`

| Task | Dependencies | Outputs | Persistent | Cached |
|------|-------------|---------|-----------|--------|
| `build` | `^build` | `.next/**`, `dist/**` | No | Yes |
| `dev` | None | None | Yes | No |
| `lint` | None | None | No | Yes |
| `typecheck` | None | None | No | Yes |
| `test` | None | None | No | Yes |
| `clean` | None | None | No | No |

**Pain points:**
- `dev` runs ALL apps simultaneously — heavy on memory + ports
- No task-level filtering in turbo.json (relies on `--filter` flags in scripts)

---

## Root Scripts

**File:** `package.json`

| Script | Command | Notes |
|--------|---------|-------|
| `dev` | `turbo dev` | All apps + packages |
| `dev:web` | `turbo dev --filter=web` | Web only |
| `dev:backend` | `turbo dev --filter=beautonomi` | Legacy? |
| `dev:customer` | `turbo dev --filter=customer` | Customer Expo |
| `dev:provider` | `turbo dev --filter=provider` | Provider Expo |
| `build` | `turbo build` | All |
| `lint` | `turbo lint` | All |
| `typecheck` | `turbo typecheck` | All |
| `test` | `turbo test` | All |
| `parity:check` | `node tooling/parity/check-parity.mjs` | Mobile parity |
| `clean` | `turbo clean && rm -rf node_modules` | ⚠️ `rm -rf` doesn't work on Windows |

**Issue:** `clean` script uses `rm -rf` which fails on Windows. Should use `rimraf` or `shx rm -rf`.

---

## Port Management

**File:** `tooling/expo-dev/port-safe-expo-dev.js`

| App | Default Port | Conflict Avoidance |
|-----|-------------|-------------------|
| Customer | 8081 | Scans 8081-8090 for available port |
| Provider | 8082 | Scans 8082-8090 for available port |
| Web (Next.js) | 3000 | Default Next.js port |

The port-safe script checks for port availability using `net.createServer()` and finds the next open port. Windows-compatible.

---

## TypeScript Configuration

### Base Config (`tooling/typescript-config/base.json`)

```json
{
  "strict": false,         // ⚠️ MAJOR RISK
  "noImplicitAny": false,  // ⚠️ Type safety hole
  "strictNullChecks": false // ⚠️ Null safety disabled
}
```

**Impact:** All packages inherit these loose settings. TypeScript won't catch null reference errors, implicit `any` types, or strict mode violations.

### Config Inheritance

| App/Package | Extends | Strict Mode |
|------------|---------|------------|
| Root `tsconfig.json` | None | `true` (packages only) |
| `apps/web` | `tooling/typescript-config/nextjs.json` → `base.json` | **false** |
| `apps/customer` | `tooling/typescript-config/expo.json` → `base.json` | **false** |
| `apps/provider` | `tooling/typescript-config/expo.json` → `base.json` | **false** |
| `packages/*` | Root references | **true** (root override) |

- [ ] Action: Enable `strict: true` in `base.json` and fix resulting type errors incrementally.

---

## Linting Configuration

### Current State

| Location | Config | Status |
|----------|--------|--------|
| `apps/web/.eslintrc.json` | `extends: ["next/core-web-vitals"]` | Legacy format |
| `apps/web/eslint.config.mjs` | Flat config with next + typescript | Modern format |
| `apps/customer` | `expo lint` (Expo built-in) | OK |
| `apps/provider` | `expo lint` (Expo built-in) | OK |
| `tooling/eslint-config/` | **EMPTY** (placeholder package) | ❌ Dead |
| Root | No ESLint config | ❌ Missing |

**Issue:** Web app has **two ESLint configs** (`.eslintrc.json` AND `eslint.config.mjs`). ESLint 9 flat config takes precedence when both exist, but this is confusing and error-prone.

- [ ] Action: Remove `.eslintrc.json` from web app, keep only `eslint.config.mjs`
- [ ] Action: Either populate `tooling/eslint-config` with shared rules or delete the package

### Prettier

| Location | Config |
|----------|--------|
| `packages/config/.prettierrc` | Exists |
| Root | **None** | 
| `apps/*` | **None** |

**Impact:** No consistent formatting across the monorepo. Each developer may use different formatting settings.

- [ ] Action: Add root `.prettierrc` that extends `packages/config/.prettierrc`

---

## CI/CD Status

### Existing CI

**File:** `apps/web/.github/workflows/test.yml`

| Job | Target | Issues |
|-----|--------|--------|
| test | `beautonomi/` (legacy) | Wrong directory |
| build | `beautonomi/` (legacy) | Wrong directory |
| security | `npm audit` (legacy) | Uses npm, not pnpm |
| errors | Grep for console.error | |

**This CI does NOT cover the monorepo.** It only targets the legacy `beautonomi/` directory.

### Recommended CI Pipeline

```yaml
# .github/workflows/ci.yml (proposed)
name: CI
on: [push, pull_request]

jobs:
  install:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile

  typecheck:
    needs: install
    runs-on: ubuntu-latest
    steps:
      - run: pnpm typecheck

  lint:
    needs: install
    runs-on: ubuntu-latest
    steps:
      - run: pnpm lint

  build-web:
    needs: [typecheck, lint]
    runs-on: ubuntu-latest
    steps:
      - run: pnpm --filter web build

  test:
    needs: install
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test
```

- [ ] Action: Create `.github/workflows/ci.yml` for monorepo CI
- [ ] Action: Move or archive legacy CI at `apps/web/.github/workflows/test.yml`

---

## Deployment Architecture

### Web App (Next.js on Vercel)

| Setting | Value | Evidence |
|---------|-------|---------|
| Framework | Next.js 15 | `apps/web/package.json` |
| Root directory | `apps/web` | Vercel project config |
| Build command | `pnpm build` | Turbo handles deps |
| Env vars | Supabase, Paystack, Mapbox, etc. | `apps/web/.env.example` |
| Cron | 5 routes configured | `vercel.json` (if exists) or Vercel dashboard |

### Mobile Apps (Expo + EAS)

| Setting | Customer | Provider |
|---------|----------|---------|
| Build profiles | development, preview, production | development, preview, production |
| OTA channels | development, preview, production | development, preview, production |
| Runtime version | `{ policy: "appVersion" }` | `{ policy: "appVersion" }` |
| Update URL | `https://u.expo.dev/beautonomi-customer` | `https://u.expo.dev/beautonomi-provider` |
| OTA enabled | Yes | Yes |

**Evidence:** `apps/customer/eas.json`, `apps/provider/eas.json`, `apps/customer/app.json`, `apps/provider/app.json`

---

## Recommended Development Scripts

```jsonc
// package.json scripts (proposed additions)
{
  "dev:web": "turbo dev --filter=web",
  "dev:customer": "turbo dev --filter=customer",
  "dev:provider": "turbo dev --filter=provider",
  "dev:packages": "turbo dev --filter='./packages/*'",
  "build:web": "turbo build --filter=web",
  "build:packages": "turbo build --filter='./packages/*'",
  "typecheck:web": "turbo typecheck --filter=web",
  "typecheck:customer": "turbo typecheck --filter=customer",
  "typecheck:provider": "turbo typecheck --filter=provider",
  "lint:fix": "turbo lint -- --fix",
  "format": "prettier --write '**/*.{ts,tsx,js,json,md}'",
  "clean": "turbo clean && npx rimraf node_modules",
  "audit:routes": "node tooling/audit/scan-routes.mjs",
  "audit:parity": "node tooling/parity/check-parity.mjs"
}
```

---

## Action Items

- [x] **CRITICAL:** Create monorepo CI pipeline (`.github/workflows/ci.yml`) — Done
- [x] **HIGH:** Enable TypeScript strict mode in `base.json` — Done: `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`
- [x] **HIGH:** Fix `clean` script for Windows (use `rimraf`) — Done: root + packages
- [x] **MEDIUM:** Remove duplicate ESLint config from web app — Done: deleted `.eslintrc.json`
- [x] **MEDIUM:** Add root `.prettierrc` — Done
- [x] **MEDIUM:** Populate or delete `tooling/eslint-config/` — Done: populated with shared rules
- [x] **LOW:** Archive legacy CI workflow — Done: renamed to `test.yml.archived`
- [x] **LOW:** Add per-app typecheck/lint scripts — Done: `typecheck:web`, `typecheck:customer`, `typecheck:provider`, `lint:fix`, `build:web`, `build:packages`
- [x] **LOW:** Set up bundle analyzer for web app — Done: `@next/bundle-analyzer` + `analyze` script
