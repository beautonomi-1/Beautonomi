# Secure Development Policy

## 1. Design

- Features that touch authentication, payments, personal information or admin functions get a security review before build (threat model or checklist in the PR/design doc).
- Apply the architecture principles: server-side authorisation, least privilege, row-level security on every table with personal data, service role only on the server, tenant isolation.

## 2. Build

- Validate all input with zod schemas at API boundaries.
- Use parameterised queries through the Supabase client; no string-built SQL.
- Never log secrets, tokens or Restricted data.
- New tables: enable RLS in the same migration; add tests in the RLS harness.
- Webhooks: verify signatures and process idempotently.
- Secrets only through environment variables; never commit them.

## 3. Review and test

- Every change goes through a pull request reviewed by a code owner (`.github/CODEOWNERS`).
- CI must pass: typecheck, lint, tests, build, dependency audit, secret scan, migration hygiene.
- Security-sensitive changes include tests for the negative case (unauthorised user is refused).

## 4. Release

- Deploy only through CI/Vercel. No manual changes on production.
- Database migrations are numbered, reviewed and applied in order.

## 5. Security testing

- Automated: dependency audit, Dependabot, gitleaks, RLS harness, E2E.
- Independent penetration test at least yearly and after major changes (see pentest runbook).

## 6. Third-party code

Add dependencies only when needed; prefer maintained packages; Dependabot keeps them updated.
