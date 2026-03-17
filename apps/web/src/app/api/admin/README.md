# Admin API Routes

Admin API routes use **section-based access**: only roles with access to the relevant admin section (or superadmin) can call each route. The incoming request must be passed for correct auth/session handling.

## Required pattern

1. **Handler signature**: Use `request` (not `_request`) so it can be passed to helpers:
   ```ts
   export async function GET(request: NextRequest) {
   ```

2. **Auth**: Use `requireAdminSection(section, request)` for section-gated routes:
   ```ts
   import { requireAdminSection } from "@/lib/supabase/api-helpers";
   import { ADMIN_SECTION_XXX } from "@/lib/admin-sections";
   await requireAdminSection(ADMIN_SECTION_XXX, request);
   ```
   For routes that allow multiple roles (e.g. providers + admin), use `requireRoleInApi(allowedRoles, request)`.

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

## Section–role permissions (superadmin)

Section access can be overridden in the DB so the sidebar and all admin API checks use the same matrix:

- **Storage:** `platform_settings.settings.admin_section_roles` (JSONB). Keys are admin section ids; values are arrays of role strings. Missing keys fall back to code defaults in `admin-sections.ts`.
- **API:** `GET /api/admin/settings/section-permissions` — any admin can read effective roles (used by the sidebar). `PUT` — superadmin only; body `{ sectionRoles }` to save overrides.
- **Enforcement:** `getEffectiveAdminSectionRoles()` in api-helpers merges DB with defaults; `requireAdminSection(section, request)` uses that for every admin route. The admin shell fetches effective roles and passes them to `canAccessSection(role, section, effectiveSectionRoles)` so the sidebar only shows allowed sections.
- **UI:** `/admin/settings/team-permissions` (superadmin only); nav link “Team permissions” under Platform config.
