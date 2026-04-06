# Admin web (Vite SPA)

Wave 0 admin UI for the Beautonomi migration: React Router, TanStack Query, and shared packages `@beautonomi/admin-access` and `@beautonomi/admin-api-client`. API calls use **cookie session** via `fetch(..., { credentials: "include" })` against the same origin in production; in local dev, Vite proxies `/api` to Next so the browser stays on one origin.

## Prerequisites

- Node 20+ and pnpm (see repo root `package.json` engines).
- **`apps/web` running on port 3000** so `/api/*` (including CSRF/session) is served by Next.

## Environment

Create `apps/admin-web/.env.local` (or export in your shell) with the **same Supabase project** as `apps/web`:

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Browser Supabase client (mirror `NEXT_PUBLIC_SUPABASE_URL`). |
| `VITE_SUPABASE_ANON_KEY` | Mirror `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |
| `VITE_WEB_ORIGIN` | Optional. Set to `http://localhost:3000` so links to **legacy** Next-only admin routes (e.g. report drill-downs) open on the Next dev server. Leave empty when the SPA and API are same-origin in production. |
| `VITE_SENTRY_DSN` | Optional. Enables Sentry when set. |

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
