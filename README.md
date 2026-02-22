# Beautonomi

Beautonomi is a monorepo for the Beautonomi beauty & wellness platform: web app, customer mobile app, and provider mobile app.

---

## Repo structure

```
Beautonomi/
├── apps/
│   ├── web/              # Next.js 16 web app (provider portal, admin, customer booking)
│   ├── customer/         # Expo (React Native) — customer-facing mobile app
│   └── provider/         # Expo (React Native) — provider-facing mobile app
├── packages/
│   ├── api/              # Shared API client & types
│   ├── analytics/        # Analytics helpers (Amplitude)
│   ├── config/           # Shared config & env types
│   ├── i18n/             # Internationalization (en, zu, af, st)
│   ├── types/            # Shared TypeScript types
│   ├── ui/               # Shared UI component library
│   ├── ui-tokens/        # Design tokens (colors, spacing, typography)
│   └── utils/            # Shared utilities
├── supabase/
│   └── migrations/       # SQL migration files (canonical source)
├── tooling/
│   ├── eslint-config/
│   ├── typescript-config/
│   └── expo-dev/         # Expo dev helpers
├── docs/                 # Documentation (audit, analytics, data model, etc.)
├── package.json          # Root workspace (pnpm)
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Prerequisites

- **Node.js** 18+
- **pnpm** 9.x (`npm install -g pnpm`)

---

## Local dev commands

### From repo root (Turborepo)

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm dev` | Run all apps in dev mode |
| `pnpm dev:web` | Run web app only |
| `pnpm dev:customer` | Run customer Expo app only |
| `pnpm dev:provider` | Run provider Expo app only |
| `pnpm build` | Build all apps |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm test` | Run all tests |

### Per-app (if Turborepo has issues on your machine)

**Web app**

```bash
cd apps/web
pnpm dev          # Dev server (Next.js)
pnpm build        # Production build
pnpm test:run     # Run Vitest
```

**Customer app (Expo)**

```bash
cd apps/customer
pnpm dev          # Expo dev server
pnpm android      # Open on Android
pnpm ios          # Open on iOS
pnpm web          # Web target
```

**Provider app (Expo)**

```bash
cd apps/provider
pnpm dev
pnpm android
pnpm ios
pnpm web
```

---

## Environment strategy

### Web app (`apps/web`)

Uses standard `.env` / `.env.local` files. Create `apps/web/.env.local` with:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side Supabase access |
| `NEXT_PUBLIC_APP_URL` | Yes | App base URL (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_SITE_URL` | No | Metadata base URL |
| `PAYSTACK_SECRET_KEY` | Payments | Paystack secret |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Payments | Paystack public key |
| `CRON_SECRET` | Cron | For cron/webhook auth |
| `AMPLITUDE_SERVER_API_KEY` | Analytics | Amplitude server key |
| `GOOGLE_CALENDAR_CLIENT_ID` / `_SECRET` | Calendar | Google OAuth |
| `OUTLOOK_CLIENT_ID` / `_SECRET` | Calendar | Outlook OAuth |
| `ONESIGNAL_APP_ID` | Push | OneSignal app ID |

Add `.env.example` in `apps/web/` documenting these (no values).

### Expo apps (`apps/customer`, `apps/provider`)

After cloning, run `env:init` to create `.env.local` from `.env.example`:

```powershell
pnpm -C apps/customer env:init
pnpm -C apps/provider env:init
```

Then fill in real values in each `.env.local`. Never commit `.env.local`.

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `EXPO_PUBLIC_APP_URL` | API base URL (local: `http://<LAN-IP>:3001`, prod: `https://<domain>`) |

See `apps/customer/docs/SETUP.md` and `apps/provider/docs/SETUP.md` for full setup. See `docs/SECURITY.md` for key rotation if secrets were ever committed.

**Troubleshooting (Expo):** If QR code / LAN fails (e.g. "failed to download remote update"), try tunnel mode:
```powershell
cd apps/customer
pnpm dev:tunnel
```
Or for provider: `cd apps/provider` then `pnpm dev:tunnel`.

---

## Internationalization (i18n)

The platform supports 4 languages:

| Code | Language | Native Name |
|------|----------|-------------|
| `en` | English | English |
| `zu` | Zulu | isiZulu |
| `af` | Afrikaans | Afrikaans |
| `st` | Sesotho | Sesotho |

Translations live in `packages/i18n/src/locales/`. The web app auto-detects browser language; mobile apps use device locale. Users can switch language via the language selector in the navbar (web) or settings (mobile).

---

## Deployment

- **Web**: Deployed via Vercel. See `apps/web/` Vercel config.
- **Mobile**: Built & submitted via EAS. See [docs/DEPLOYMENT_EAS.md](./docs/DEPLOYMENT_EAS.md) for full setup guide.
- **Database**: Supabase migrations in `supabase/migrations/`. See [supabase/README.md](./supabase/README.md).

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branch naming, commit style, and workflow.
