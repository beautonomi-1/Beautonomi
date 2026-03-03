# Lint fix strategy

## Script: `lint-fix-everything.mjs`

Run from `apps/web`:

```bash
pnpm run lint:fix-everything
# or
node scripts/lint-fix-everything.mjs
```

### What it does

1. **Phase 1 – ESLint --fix (safe)**  
   Runs `eslint . --fix` up to 3 times. Fixes:
   - Unused imports (removed)
   - `prefer-const` (let → const where possible)
   - `no-var` (var → let/const)
   - `react/no-unescaped-entities` (escape `'` and `"` in JSX text)
   - Any other rules that provide a direct **fix** (not just suggestions).

2. **Phase 2 – Suggestion fixes (optional)**  
   Use `--apply-suggestions` to apply ESLint **suggestions** that include a fix, e.g.:
   - `@typescript-eslint/no-explicit-any` → replace `any` with `unknown`.  
   After applying, the script runs typecheck. If typecheck fails (common after any→unknown), run:
   ```bash
   node scripts/revert-unknown-to-any.mjs
   ```
   to undo.

3. **Phase 3 – Report**  
   Prints remaining issue counts by rule.

### Options

- `--apply-suggestions` – Apply suggestion-based fixes (e.g. any→unknown). Use with caution; typecheck may fail.
- `--skip-typecheck` – Do not run typecheck at the end (faster for Phase 1 only).

### What is not auto-fixed

- **no-explicit-any (4643+)** – Replacing with `unknown` is suggested by ESLint but causes type errors where properties are used without narrowing. Fix incrementally by adding types or type guards, or leave as warnings.
- **react-hooks/exhaustive-deps (159)** – Adding/removing deps can change behavior; fix manually.
- **react-hooks/rules-of-hooks, purity, etc.** – Require code/logic changes.
- **unused-imports/no-unused-vars (18)** – Unused variables/params; fix by prefixing with `_` or removing.
- **no-img-element (31)** – Replace `<img>` with `next/image` (partially done; remaining can be fixed manually or in batches).

### Other scripts

- `lint:fix` – Single `eslint . --fix`.
- `lint:fix-all` – `eslint . --fix` then typecheck (no suggestion application).
- `lint-warnings-by-rule.mjs` – Report issue counts by rule (no fixes).
- `revert-unknown-to-any.mjs` – Revert `unknown` → `any` and `as unknown` → `as any` after a bad `--apply-suggestions` run.
