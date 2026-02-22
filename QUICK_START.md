# Quick Start Guide

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9.15 (`npm install -g pnpm`)
- **Supabase** account with a project
- **Expo CLI** (`npm install -g eas-cli`) for mobile apps

---

## 1. Clone & Install

```bash
git clone <repo-url> beautonomi
cd beautonomi
pnpm install
```

## 2. Set Up Environment Variables

Copy the example files and fill in your values:

```bash
# Web app
cp apps/web/.env.example apps/web/.env.local

# Customer mobile app
cp apps/customer/.env.example apps/customer/.env.local

# Provider mobile app
cp apps/provider/.env.example apps/provider/.env.local
```

At minimum, you need `SUPABASE_URL` and `SUPABASE_ANON_KEY` in each.

## 3. Apply Database Migrations

```bash
cd supabase
npx supabase db push
```

This applies all 229+ migration files (tables, functions, RLS policies, seed data).

## 4. Build Shared Packages

```bash
pnpm build:packages
```

## 5. Run Development Servers

```bash
# All apps at once
pnpm dev

# Or individually:
pnpm dev:web        # Next.js at http://localhost:3000
pnpm dev:customer   # Expo customer app
pnpm dev:provider   # Expo provider app
```

---

## Project Structure

```
beautonomi/
  apps/
    web/           # Next.js 15 web app (customer + provider + superadmin portals)
    customer/      # Expo React Native customer mobile app
    provider/      # Expo React Native provider mobile app
  packages/
    types/         # Shared TypeScript types
    api/           # Shared API client
    config/        # Shared configuration
    utils/         # Shared utilities
    ui/            # Shared UI components
    ui-tokens/     # Design tokens
    analytics/     # Analytics integration
    i18n/          # Internationalization (en, zu, af, st)
  tooling/         # Shared configs (TypeScript, ESLint, Tailwind)
  supabase/        # Database migrations
  docs/            # Documentation
```

## Useful Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps |
| `pnpm build` | Build everything |
| `pnpm typecheck` | TypeScript check all |
| `pnpm lint` | Lint all apps |
| `pnpm test` | Run tests |
| `pnpm clean` | Remove all build artifacts |

## Mobile App Builds

```bash
# Build customer app for development
cd apps/customer
eas build --profile development --platform ios

# Build provider app for development
cd apps/provider
eas build --profile development --platform android
```

See `docs/DEPLOYMENT_EAS.md` for full EAS deployment instructions.

---

## Need Help?

- **Architecture**: See `docs/AUDIT_REPORT.md`
- **Deployment**: See `docs/DEPLOYMENT_EAS.md`
- **Contributing**: See `CONTRIBUTING.md`
