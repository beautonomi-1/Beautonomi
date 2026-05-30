# Vercel deploy hooks (GitHub → Preview / Production)

Use this when pushes to GitHub do not create Vercel deployments (empty **Deployments** list, no **Vercel** check on commits). The repo workflow [`.github/workflows/vercel-deploy.yml`](../.github/workflows/vercel-deploy.yml) triggers Vercel **Deploy Hooks** on push.

## Branch → environment

| Git branch | GitHub Actions job | Vercel environment | Secret name |
|------------|-------------------|--------------------|-------------|
| `develop` | Vercel Preview (develop) | **Preview** | `VERCEL_DEPLOY_HOOK_DEVELOP` |
| `main` | Vercel Production (main) | **Production** | `VERCEL_DEPLOY_HOOK_MAIN` |

Crons in `apps/web/vercel.json` run only on the **production** deployment (typically `main`).

## One-time setup

### 1. Create hooks in Vercel

**Vercel** → your **web** project (`apps/web` root) → **Settings** → **Git** → **Deploy Hooks**

| Hook name (suggested) | Branch |
|----------------------|--------|
| `github-develop` | `develop` |
| `github-main` | `main` |

Copy each URL (treat as a secret).

### 2. Add GitHub repository secrets

**GitHub** → `beautonomi-1/Beautonomi` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Name | Value |
|------|--------|
| `VERCEL_DEPLOY_HOOK_DEVELOP` | Deploy hook URL for branch `develop` |
| `VERCEL_DEPLOY_HOOK_MAIN` | Deploy hook URL for branch `main` |

### 3. Verify

Push to `develop` (or merge a change under `apps/web/**`, `packages/**`, etc.):

- **Actions** → workflow **Vercel Deploy** → job **Vercel Preview (develop)** succeeds
- **Vercel** → **Deployments** → new Preview build

Push to `main` → **Vercel Production (main)** → Production deployment.

Test a hook manually:

```bash
curl -X POST "YOUR_DEPLOY_HOOK_URL"
```

## What runs on push

The workflow runs only when changed paths affect the web monorepo (web app, admin SPA, shared packages, lockfile, turbo config). Docs-only pushes skip it.

If secrets are missing, the job **warns** and exits successfully (CI is not blocked). Add secrets to enable deploys.

## E2E (Preview)

[`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml) runs Playwright against a successful Vercel **Preview** `deployment_status`. After Preview deploys succeed, **E2E (Preview)** should appear under Actions.

## Restore native Vercel Git integration (optional)

If you reconnect **Vercel** → **Git** and the **Vercel GitHub App** works again, you may get **two** deploys per push (app + hook). Then either:

- Remove repository secrets and disable `vercel-deploy.yml`, or
- Disconnect Git auto-deploy in Vercel and keep hooks only.

## Vercel project settings (reference)

| Setting | Value |
|---------|--------|
| Root Directory | `apps/web` |
| Include files outside root | **On** (monorepo) |
| Node.js | **24** |
| Production Branch | `main` |
| Preview Deployments | **On** |

See also [GO_LIVE_NOW.md](./GO_LIVE_NOW.md) §3 and [ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md](./platform/admin-spa/ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md).
