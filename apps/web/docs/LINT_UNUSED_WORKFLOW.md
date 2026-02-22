# Fixing no-unused-vars faster

## One-command fix for unused imports

Unused **imports** are now auto-fixed by ESLint:

```bash
cd apps/web
pnpm run lint:fix
```

This runs `eslint . --fix`. The **eslint-plugin-unused-imports** plugin removes unused import symbols automatically, so you don’t have to edit those by hand.

## What’s left after `lint:fix`

Remaining **unused-vars** are things that can’t be safely auto-fixed (params, local variables, catch bindings). Fix them by:

- **Parameters / locals:** prefix the name with `_` (e.g. `id` → `_id`, `error` → `_error`). ESLint is configured to ignore names matching `^_`.
- **Catch bindings:** if the catch block doesn’t use the binding, use `catch` with no variable (e.g. `catch (e)` → `catch`).

## Report remaining unused-vars

To list all remaining unused-vars by file and line:

```bash
cd apps/web
pnpm run lint:unused-report
```

Use this to fix in batches (e.g. open each file and apply the `_` prefix or remove the catch binding at the reported line).

## Summary

| Step | Command | Effect |
|------|---------|--------|
| 1 | `pnpm run lint:fix` | Removes unused imports across the codebase |
| 2 | `pnpm run lint:unused-report` | Lists remaining vars/params to fix |
| 3 | Manually prefix with `_` or use bare `catch` | Clears remaining no-unused-vars |
