# Admin web (Vite SPA)

Wave 0 admin UI for the Beautonomi migration: React Router, TanStack Query, and shared packages `@beautonomi/admin-access` and `@beautonomi/admin-api-client`. API calls use **cookie session** via `fetch(..., { credentials: "include" })` against the same origin in production; in local dev, Vite proxies `/api` to Next so the browser stays on one origin.

## Prerequisites

- Node 20+ and pnpm (see repo root `package.json` engines).
- **`apps/web` running on port 3000** so `/api/*` (including CSRF/session) is served by Next.

## Environment

Vite merges **both** `apps/admin-web/.env*` and `apps/web/.env*` (admin overrides web on conflicts), then falls back to **`process.env`**. So you can rely on the **same `NEXT_PUBLIC_*` variables as Next.js** for builds (e.g. Vercel) without copying them into `VITE_*`, as long as the web app’s env is available when `pnpm build` runs for `admin-web`.

Create `apps/admin-web/.env.local` only when you need SPA-specific overrides; otherwise copy from `apps/web/.env.example` into `apps/web/.env.local` and run Vite — Supabase and other public keys are picked up automatically.

| Variable (Vite) | Next.js equivalent | Purpose |
|-----------------|-------------------|---------|
| `VITE_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` | Browser Supabase client. |
| `VITE_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key. |
| `VITE_APP_URL` | `NEXT_PUBLIC_APP_URL` | Absolute app origin when needed. |
| `VITE_SITE_URL` | `NEXT_PUBLIC_SITE_URL` | Canonical site URL fallback. |
| `VITE_WEB_ORIGIN` | — | Dev: `http://localhost:3000` for links to legacy Next-only admin routes. Empty when same-origin in production. |
| `VITE_SENTRY_DSN` | `NEXT_PUBLIC_SENTRY_DSN` | Sentry browser DSN. |
| `VITE_SENTRY_ENVIRONMENT` | — | Sentry environment label (defaults to Vite `MODE`). |
| `VITE_GOOGLE_ANALYTICS_ID` | `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` | Optional analytics. |
| `VITE_AMPLITUDE_API_KEY` | `NEXT_PUBLIC_AMPLITUDE_API_KEY` | Optional. |
| `VITE_MAPBOX_ACCESS_TOKEN` | `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | Optional. |
| `VITE_GLOBAL_ENTRY_HOST` | `NEXT_PUBLIC_GLOBAL_ENTRY_HOST` | Market / routing UX. |
| `VITE_DEFAULT_MARKET_HOST` | `NEXT_PUBLIC_DEFAULT_MARKET_HOST` | Default market host. |
| `VITE_MARKET_OVERRIDE_TTL_HOURS` | `NEXT_PUBLIC_MARKET_OVERRIDE_TTL_HOURS` | Override TTL. |
| `VITE_CATEGORY_ICON_CACHE_REVISION` | `NEXT_PUBLIC_CATEGORY_ICON_CACHE_REVISION` | Cache bust param. |

Runtime reads go through `src/config/publicEnv.ts`.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Vite dev server (default port **5173**). Proxies **`/api`** and **`/auth`** → `http://localhost:3000` (sign-in under `/api/auth/*`; OAuth callback under `/auth/*`). |
| `pnpm build` | Production build to `dist/` (`base: /admin/`). |
| `pnpm preview` | Preview production build. |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm lint` | ESLint. |
| `pnpm test` | Vitest. |

From the **repo root**: `pnpm dev:admin` runs this app’s dev task via Turbo; `pnpm build:admin` builds it.

## Typical local workflow

1. Terminal A: `pnpm dev:web` (or `pnpm --filter web dev`) — Next on **3000**.
2. Terminal B: `pnpm dev:admin` — Vite on **5173** with `/admin/` base path.
3. Open `http://localhost:5173/admin/login` (or the path Vite prints).

Session cookies are set on `localhost` but **ports differ**; signing in via the SPA uses `/api/auth/sign-in` through the proxy so cookies apply to the Vite origin where the SPA runs. If something still looks “logged out,” confirm both servers are up and env vars match `apps/web`.

## Deployment

Production still serves admin from Next until cutover. See [`docs/platform/admin-spa/ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md`](../../docs/platform/admin-spa/ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md) and [`ADMIN_SPA_CUTOVER_PLAN.md`](../../docs/platform/admin-spa/ADMIN_SPA_CUTOVER_PLAN.md).
