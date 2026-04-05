# Provider portal: RSC initial data + client island

Use this pattern for fast TTFB on data-heavy provider routes (see `dashboard/` and `calendar/`).

## Structure

1. **`page.tsx`** (Server Component)  
   - `export const dynamic = "force-dynamic"` when auth/session must be fresh.  
   - `await` a `fetch*Initial()` loader.  
   - Render `<FooClient initial… />` with serialized props only (no secrets).

2. **`fetch-*-initial.ts`** (server-only)  
   - Build requests with `createNextRequestFromHeaders` from `@/lib/server/create-next-request`.  
   - Call **`getXxxResponse(req)`** from `@/lib/server/...` or **`import { GET as getFoo } from "@/app/api/.../route"`** and `await getFoo(req)`.  
   - **Do not** `fetch(origin + "/api/...")` from the server (avoids loopback HTTP).  
   - Parse `Response` with `res.json()`; handle `!res.ok` like `fetch-dashboard-initial.ts`.

3. **`*Client.tsx`** (`"use client"`)  
   - Accept `initialBookings` / `initialError` / etc.  
   - Seed state from props; avoid a blocking loading spinner when `initial*` succeeded.  
   - On filter/context changes (e.g. `selectedLocationId` from `localStorage`), refetch as today.

## Location filter and SSR

`selectedLocationId` is often **client-only** (`localStorage`). SSR should load the **same default** as the client with no location (no `location_id` query). After hydration, the client refetches when the user has a saved location.

## Shared transforms

If the client imports a large module (e.g. `api.ts`), duplicate small pure helpers in the server loader or import from a **thin** shared file so the server bundle stays lean (`fetch-calendar-initial.ts` pattern).
