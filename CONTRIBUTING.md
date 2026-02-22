# Contributing to Beautonomi

## Branch naming

Use lowercase, hyphen-separated names. Prefix with a type:

| Prefix | Use for |
|--------|---------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `chore/` | Build, deps, tooling |
| `docs/` | Documentation only |
| `refactor/` | Code refactor, no behavior change |
| `perf/` | Performance improvements |
| `test/` | Adding or fixing tests |

### Examples

```
feat/explore-saved-posts
fix/booking-calendar-timezone
chore/upgrade-next-16
docs/api-readme
refactor/extract-booking-helpers
```

---

## Commit style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Use for |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Maintenance (deps, config) |
| `docs` | Documentation |
| `refactor` | Refactor |
| `perf` | Performance |
| `test` | Tests |
| `style` | Formatting (no code change) |

### Scope (optional)

Scope to the app or package when helpful:

- `web` — apps/web
- `customer` — apps/customer
- `provider` — apps/provider
- `api` — packages/api
- `types` — packages/types

### Examples

```
feat(web): add explore saved posts
fix(booking): correct timezone in calendar slots
chore: bump pnpm to 9.15
docs: update README env vars
refactor(api): extract pagination helpers
```

### Rules

- Use imperative mood: "add" not "added" or "adds"
- No period at the end of the subject
- Subject line ≤ 72 characters
- Reference issues in footer: `Closes #123`
