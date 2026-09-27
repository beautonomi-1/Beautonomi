# Branch protection on `main`

Configure in GitHub **Settings → Branches → Branch protection rules** for `main`:

| Setting | Value |
|---------|--------|
| Require a pull request before merging | On |
| Required approvals | ≥ 1 |
| Dismiss stale pull request approvals when new commits are pushed | On |
| Require review from Code Owners | On (uses `.github/CODEOWNERS`) |
| Require status checks to pass before merging | On — include `ci` workflow jobs (RLS harness, admin nav regression, TypeScript) |
| Require branches to be up to date before merging | On |
| Do not allow bypassing the above settings | On for non-admins |
| Restrict who can push to matching branches | On — release managers only |
| Allow force pushes | Off |
| Allow deletions | Off |

Document any exception in the GRC exception register (`grc_exceptions`) with compensating controls and review date.
