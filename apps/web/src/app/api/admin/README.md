# Admin API Routes

All admin API routes require **superadmin** role and must receive the incoming request for correct auth/session handling.

## Required pattern

1. **Handler signature**: Use `request` (not `_request`) so it can be passed to helpers:
   ```ts
   export async function GET(request: NextRequest) {
   ```

2. **Auth**: Always pass the request to `requireRoleInApi`:
   ```ts
   await requireRoleInApi(["superadmin"], request);
   ```

3. **Supabase**: Pass the request to `getSupabaseServer` when using the server client (so cookies are used for the same request):
   ```ts
   const supabase = await getSupabaseServer(request);
   ```

This avoids "Authentication required" or "Failed to fetch" errors when the session is read from cookies on the same request.

## Admin pages (client)

Admin pages that fetch data on load should guard the fetch until the user is known to be superadmin:

- Use `useAuth()` and only call the fetch (e.g. `loadSettings()`) when `user?.id && role === "superadmin"`.
- Set `isLoading(false)` when `role !== "superadmin"` so the UI doesn’t spin forever before redirect.

See `app/admin/settings/platform-fees/page.tsx` and `app/admin/dashboard/page.tsx` for the pattern.
