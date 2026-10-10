# Explore sound catalog — QA checklist

Fact-checked against the sound catalog implementation plan and codebase. Run on **staging** after migration **979** and flags below.

## Required feature flags

| Flag | Purpose |
|------|---------|
| `explore.enabled` | Customer Explore surfaces |
| `explore.provider_posts` | Provider composers + `GET /api/explore/upload` (includes `sound_catalog_enabled`) |
| `explore.sound_catalog` | Catalog API, admin upload, picker visibility, `sound_id` on publish |

Without **`explore.provider_posts`**, providers cannot read upload caps and the **Add music** block stays off even if `explore.sound_catalog` is on.

## Automated (local / CI)

```bash
cd apps/web && pnpm exec vitest run src/lib/explore/__tests__/explore-media-parity.test.ts
cd apps/web && pnpm exec tsc --noEmit
cd apps/admin-web && pnpm exec tsc --noEmit
cd apps/provider && pnpm exec tsc --noEmit
```

## Manual sign-off (plan verification checklist)

1. **Admin upload** — Superadmin → **Explore Sounds** → upload MP3/M4A → row appears with preview audio, created date, hide/show, title edit. Objects under `explore/platform/` in bucket **`explore-posts`**.
2. **Provider catalog** — Web + mobile: **first slide is video** → **Add music (optional)** visible even when catalog empty (matches customer full-screen `explore-video` entry). Platform sounds under **Popular sounds**; own sounds under **Your sounds** when present.
3. **Preview** — Play/pause on a chip; only one preview at a time; selection shows check/accent.
4. **Publish** — Video post with platform `sound_id` → API 200; post detail/feed includes `sound_url` via enrich. **Original audio** → no `sound_id` / no bed.
5. **Customer playback** — From Explore tab, open **full-screen video** (`explore-video`) → bed plays when `sound_url` set; clip video muted when bed active (`effectiveMuted = muted || useSoundTrack`).
6. **Hide sound** — Superadmin hides platform track → gone from picker; existing posts with that `sound_id` lose `sound_url` in API (enrich excludes hidden).
7. **Flag off** — Disable `explore.sound_catalog` → picker hidden; `GET /api/explore/sounds/mine` returns empty; POST/PATCH with `sound_id` → **400** “Sound catalog is disabled”.
8. **Photo post** — Publish/edit photo-only post → `sound_id` cleared or rejected if client sends sound on non-video.

## V1 architecture boundaries (fact-checked in repo)

These are **intentionally not implemented** in v1. QA should confirm nothing partially ships them (no dead UI, no broken encode, no orphan storage deletes).

| Topic | v1 behavior | Where verified |
| ----- | ----------- | -------------- |
| **Rendobar + music** | Video transcode uses provider clip audio only (H.264 + AAC). **`sound_id` is never passed** into probe/encode/webhook paths. Music is **`sound_url` + `ExploreSoundBed`** on customer mobile only. | `enqueue-video-processing.ts`, `rendobar-jobs.ts`, `rendobar-encode-path.ts` (no `sound` references); `sound-enrich.ts` |
| **Web customer bed** | **`apps/web` Explore** (`ExplorePostDetail`, feed cards) plays **one** video track — no `<audio>` bed, no `sound_url` UI even though API may return `sound_url` on posts. | `apps/web/src/components/explore/*` (no `sound_url` usage); customer `explore-video.tsx` only |
| **Delete platform sounds** | Admin **Hide/Show** only (`PATCH is_hidden`). **No DELETE** route, no storage GC cron for `explore/platform/*`. Hidden rows stay in DB + bucket; posts keep `sound_id` FK but **enrich drops `sound_url`**. | `api/admin/explore/sounds/route.ts` (GET/PATCH/POST only); `ExploreSoundsPage.tsx` |

**What “works fully” means for v1:** Provider picks catalog sound → `sound_id` on post → API enrich adds `sound_url` → **customer opens video from Explore tab on mobile** → bed plays, clip muted. Web viewers and Rendobar-delivered MP4s are unchanged from pre-catalog video behavior.

## Out of scope (do not fail QA on these)

- Mixing catalog audio into Rendobar FFmpeg output (use customer player bed instead).
- Web customer Explore sound bed (mobile `explore-video` only).
- Hard-delete platform sounds + storage garbage collection (**hide** via `is_hidden` only).
- Provider self-upload sound UI (API exists; no v1 composer upload).
- TikTok-style trending / discovery feed.

## Related

- [EXPLORE_MEDIA_STAGING_SIGNOFF.md](./EXPLORE_MEDIA_STAGING_SIGNOFF.md) — step **11** (sound catalog)
