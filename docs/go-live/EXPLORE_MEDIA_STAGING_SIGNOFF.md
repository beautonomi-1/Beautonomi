# Explore media staging sign-off

Run on staging after migrations **979**, **980**, and **981** and feature flags (`explore.enabled`, `explore.provider_posts`, optional `explore.image_upload`, `explore.text_overlays`, `explore.sound_catalog`, Rendobar transcode). Rendobar scope: [EXPLORE_RENDOBAR_SCOPE.md](./EXPLORE_RENDOBAR_SCOPE.md).

1. **Filters:** Change sort/category/search on web and mobile; paginate — no skipped or duplicate rows (cursor includes filter fingerprint).
2. **Large image:** Provider mobile/web upload HEIC/JPEG &gt; 4.5 MB via signed slot → PUT → finalize; publish with `media_meta.display_path`.
3. **Photo text:** Two layers on slide 1; grid/detail/share show burned JPEG once (no player overlay on stills).
4. **Carousel:** Text on slide 2 only; swipe mobile/web detail.
5. **Video text:** Player shows JSON until `playback_path` + `status=delivered`; after Rendobar webhook, no double text.
6. **Video trim (WhatsApp-style):** Provider web + mobile — pick long video → trim sheet/modal → publish with `media_meta.trim_start_ms` / `trim_end_ms` / `source_duration_ms`; Rendobar encode uses `-ss` + `-t`; playback length matches chosen window (not always first 60s).
6a. **In-app camera:** Web + provider mobile — photo **tap**, video **hold** with circular progress ring; release ends clip → trim sheet (videos) → publish.
7. **Rendobar:** One encode with `drawtext` on MP4 and poster; if worker lacks filter, disable `explore.text_overlays` and document player-only text.
8. **Gallery / portfolio:** Video “add to portfolio” uses display JPEG after poster webhook.
9. **Delete post:** Storage paths purged via `collectExplorePostStoragePaths`.
10. **Performance:** 5-slide photo publish &lt; 60s; 15 MB signed image finalize succeeds.
11. **Sound catalog:** Requires `explore.sound_catalog` and `explore.provider_posts`. Superadmin uploads MP3/M4A on **Explore Sounds**; provider web + mobile video post shows **Add music** (platform + own sounds, preview chips); customer **full-screen video** plays bed when `sound_id` is set. Full steps: [EXPLORE_SOUND_CATALOG_QA.md](./EXPLORE_SOUND_CATALOG_QA.md).

**Cron:** `/api/cron/explore-media-backfill` re-watermarks missing posters only; does not reconstruct overlay JSON. Failed encodes re-run with stored `text_overlays` when jobs are re-enqueued.

**Publish order:** Photo Sharp burn runs before `runExplorePublishSideEffects` so moderation and gallery see final pixels.
