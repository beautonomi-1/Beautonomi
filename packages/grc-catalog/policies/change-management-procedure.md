# Change Management Procedure

## 1. Standard changes (code and configuration in the repo)

1. Open a pull request describing the change, risk and rollback.
2. A code owner reviews and approves. Authors can't approve their own PRs.
3. CI passes (required status checks).
4. Merge to the default branch; Vercel deploys.

## 2. Database migrations

- Add a new numbered file in `supabase/migrations/`; never edit an applied migration.
- Migrations must be idempotent where practical and enable RLS on new tables.
- Apply to staging first, then production, in order.

## 3. Configuration outside the repo

Changes to Supabase settings, Vercel environment variables, DNS, payment provider settings and GitHub settings are recorded in [change log location] with who, what, when and why.

## 4. Emergency changes

Allowed to restore service or contain an incident. Record them and complete the PR review within **2 working days**.

## 5. Evidence

PR history, CI runs and deployment history are the change records. The hub's CI collector samples them daily.
