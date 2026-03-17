# Web app – lint guide

Run all commands from `apps/web` unless noted.

---

## 1. Quick fix: unused imports and vars

### One-command fix for unused imports

Unused **imports** are auto-fixed by ESLint:

```bash
pnpm run lint:fix
```

This runs `eslint . --fix`. The **eslint-plugin-unused-imports** plugin removes unused import symbols automatically.

### What's left after `lint:fix`

Remaining **unused-vars** are things that can't be safely auto-fixed (params, local variables, catch bindings). Fix them by:

- **Parameters / locals:** prefix the name with `_` (e.g. `id` → `_id`, `error` → `_error`). ESLint is configured to ignore names matching `^_`.
- **Catch bindings:** if the catch block doesn't use the binding, use `catch` with no variable (e.g. `catch (e)` → `catch`).

### Report remaining unused-vars

```bash
pnpm run lint:unused-report
```

Lists all remaining unused-vars by file and line so you can fix in batches.

### Summary

| Step | Command | Effect |
|------|---------|--------|
| 1 | `pnpm run lint:fix` | Removes unused imports across the codebase |
| 2 | `pnpm run lint:unused-report` | Lists remaining vars/params to fix |
| 3 | Manually prefix with `_` or use bare `catch` | Clears remaining no-unused-vars |

---

## 2. Full lint fix: `lint-fix-everything.mjs`

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

- **no-explicit-any** – Replacing with `unknown` is suggested by ESLint but causes type errors where properties are used without narrowing. Fix incrementally or leave as warnings.
- **react-hooks/exhaustive-deps** – Adding/removing deps can change behavior; fix manually.
- **react-hooks/rules-of-hooks, purity, etc.** – Require code/logic changes.
- **unused-imports/no-unused-vars** – Unused variables/params; fix by prefixing with `_` or removing.
- **no-img-element** – Replace `<img>` with `next/image` (manually or in batches).

### Other scripts

- `lint:fix` – Single `eslint . --fix`.
- `lint:fix-all` – `eslint . --fix` then typecheck (no suggestion application).
- `lint-warnings-by-rule.mjs` – Report issue counts by rule (no fixes).
- `revert-unknown-to-any.mjs` – Revert `unknown` → `any` and `as unknown` → `as any` after a bad `--apply-suggestions` run.
