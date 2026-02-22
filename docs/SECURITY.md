# Security

## Environment & secrets

### Never commit real keys

- **Never** commit real Supabase anon keys, service role keys, or project URLs in `.env.example` or any tracked file.
- `.env.example` must contain **placeholders only** (e.g. `YOUR_SUPABASE_URL`, `YOUR_SUPABASE_ANON_KEY`).
- Real values belong in `.env.local`, which is gitignored.

### If secrets were committed

If a Supabase anon key or project URL was ever committed to the repo:

1. **Rotate the Supabase anon key**  
   Supabase Dashboard → Project Settings → API → regenerate anon key.
2. Update your local `.env.local` and any CI/deployment secrets with the new key.
3. If the service role key was exposed, rotate it as well and update server-side config.
4. Consider using `git filter-branch` or BFG Repo-Cleaner to remove the key from history (use with caution and team coordination).

## File checklist

| File | Committed? | Contains |
|------|------------|----------|
| `.env.example` | Yes | Placeholders only |
| `.env.local` | No (gitignored) | Real values for local dev |
| `google-services.json` | No | Firebase/Google config |
| `GoogleService-Info.plist` | No | iOS Firebase config |
