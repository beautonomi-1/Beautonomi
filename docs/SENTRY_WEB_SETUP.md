# Sentry – Web App Setup

This guide gets the web app reporting errors to Sentry and (optionally) uploading source maps for readable stack traces.

## 1. Get your DSN from Sentry

1. Go to [sentry.io](https://sentry.io) and sign in (or create an account).
2. Create an organization and a project, or use an existing project.
3. **Project → Settings → Client Keys (DSN)** – copy the **DSN** (starts with `https://...@...ingest.sentry.io/...`).

You will use this value for both `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` below.

## 2. Set environment variables locally

1. In the repo root, ensure you have a local env file:

   ```bash
   # From repo root
   cp apps/web/.env.example apps/web/.env.local
   ```

2. Open `apps/web/.env.local` and set (paste your DSN from step 1):

   ```env
   SENTRY_DSN=https://your-key@xxx.ingest.sentry.io/yyy
   NEXT_PUBLIC_SENTRY_DSN=https://your-key@xxx.ingest.sentry.io/yyy
   ```

3. Restart the dev server. Errors from the web app will now be sent to Sentry.

## 3. (Optional) Source maps and release tracking

For readable stack traces in Sentry and release association:

1. **Auth token**  
   [Sentry → Settings → Auth Tokens](https://sentry.io/settings/account/api/auth-tokens/) → Create New Token. Scopes: `project:releases`, `org:read`. Copy the token.

2. **Org and project slugs**  
   From your Sentry URL, e.g. `https://sentry.io/organizations/my-org/projects/my-project/`:
   - `SENTRY_ORG` = `my-org`
   - `SENTRY_PROJECT` = `my-project`

3. Add to `apps/web/.env.local` (and in Vercel for production):

   ```env
   SENTRY_AUTH_TOKEN=sntrys_...
   SENTRY_ORG=your-org-slug
   SENTRY_PROJECT=your-project-slug
   ```

Builds (including on Vercel) will then upload source maps to Sentry.

## 4. Set environment variables on Vercel

1. Open your project in [Vercel Dashboard](https://vercel.com/dashboard) → **Settings → Environment Variables**.

2. Add (for Production, Preview, and Development if you want):

   | Name                     | Value              | Notes                    |
   |--------------------------|--------------------|--------------------------|
   | `SENTRY_DSN`             | Your DSN           | Same as in .env.local    |
   | `NEXT_PUBLIC_SENTRY_DSN` | Your DSN           | Same as above            |
   | `SENTRY_AUTH_TOKEN`      | Your auth token    | Optional, for source maps |
   | `SENTRY_ORG`             | Your org slug      | Optional, for source maps |
   | `SENTRY_PROJECT`         | Your project slug  | Optional, for source maps |

3. Redeploy so the new variables are used.

## 5. Verify

- **Local:** Run the web app, trigger an error (e.g. throw in a button handler), and check [Sentry → Issues](https://sentry.io/issues/).
- **Env check:** From repo root: `cd apps/web && node scripts/check-sentry-env.mjs` to see which Sentry vars are set (reads `.env.local` automatically).

## 6. Mobile (Customer & Provider Expo apps)

Both Expo apps use `@sentry/react-native` and init Sentry from `src/lib/sentry.ts`. Set `EXPO_PUBLIC_SENTRY_DSN` in each app’s `.env.local`; it is exposed via `app.config.js` → `extra` so the DSN is available at runtime.

- **Customer app (mobile-customer):** See [docs/SENTRY_MOBILE_CUSTOMER_SETUP.md](SENTRY_MOBILE_CUSTOMER_SETUP.md) for DSN and verification.
- **Provider app (mobile-provider):** See [docs/SENTRY_MOBILE_PROVIDER_SETUP.md](SENTRY_MOBILE_PROVIDER_SETUP.md) for DSN and verification.
- See `docs/ENVIRONMENT_MATRIX.md` for the variable table.

## Reference

- [Sentry Next.js docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry API overview](https://docs.sentry.io/api/)
