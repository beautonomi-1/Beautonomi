# Explore × Rendobar — what we use today vs platform capabilities

Beautonomi Explore video processing uses **Rendobar as a storage-aware FFmpeg/ffprobe adapter** (`apps/web/src/lib/explore/rendobar-jobs.ts`), aligned with the public API in [Rendobar SDK docs](https://rendobar.com/docs/sdk): `type` + `params.command`, `inputs` map (`storage://…`), `destinations` string array, per-job `callback.verify`, server-side `RENDOBAR_API_KEY` only. **Mobile apps never call Rendobar** — publish → web API → probe/encode jobs → signed callbacks to `/api/webhooks/rendobar`.

## Used in production path (ready when secrets + flags are set)

| Rendobar capability (vendor) | Beautonomi usage | Notes |
|------------------------------|------------------|--------|
| **Raw FFmpeg execution** | **Yes** — `type: "ffmpeg"` jobs with explicit `command[]` (scale H.264 + AAC, dual output: `playback.mp4` + `poster.jpg`) | Same `-vf` on both outputs; optional `drawtext` chain when `explore.text_overlays` is on |
| **Metadata extraction (ffprobe)** | **Yes** — `type: "ffprobe"` before encode | User-chosen window in `media_meta` (`trim_start_ms` / `trim_end_ms`) → ffmpeg **`-ss` + `-t`**; fallback first **`max_duration_ms`** when trim omitted. **No slot reject / no `DURATION_EXCEEDED` draft.** |
| Storage read/write | **Yes** — `storage://{connectionId}/{path}` inputs and destinations | Requires `rendobar_storage_connection_id` + Supabase bucket wiring |

**Readiness checklist**

1. Admin: `rendobar_api_key`, **Rendobar org callback signing secret** as `rendobar_callback_secret`, `rendobar_storage_connection_id` (or env fallbacks). Web server **`APP_URL`** (public HTTPS) so per-job `callback.url` is absolute.
2. Superadmin → Integrations → Rendobar: **Integration ready = Yes** (API key + storage + callback secret + APP_URL).
3. Flag: `explore.video_transcode` (+ `explore.video_upload`).
4. Staging probe: encode job completes; webhook updates `playback_path` / poster `display_path`.
5. Staging probe: `drawtext` on worker (or disable `explore.text_overlays` for player-only text).

## Future Rendobar capabilities (ready to turn on — **default OFF**)

Seeded in migration **981** as `feature_flags.enabled = false`. Admin → Integrations → Rendobar lists each flag. **Enabling a flag today does not change encode behavior** until the matching adapter is implemented in `rendobar-encode-path.ts` (v1 always uses `type: ffmpeg`).

| Flag key | Rendobar capability | v1 behavior (flags OFF) | When ready |
|----------|---------------------|---------------------------|------------|
| `explore.rendobar_ai_captions` | AI captioning / burned subtitles | Manual overlays only (JSON + Sharp/`drawtext`) | Enable flag **after** caption job adapter + staging sign-off |
| `explore.rendobar_timeline_compose` | JSON timeline composition | Single-input ffmpeg encode | Enable flag **after** timeline job adapter ships |
| `explore.rendobar_smart_compression` | Smart compression | CRF 23 / preset `fast` in `buildEncodeJob` | Enable flag **after** target-size job adapter ships |

**Do not enable these flags in production until the adapter is deployed** — logs will note “flag on, v1 ffmpeg still used” and behavior stays on the standard path.

## Integrity (by design)

- **Explore music catalog (`sound_id`)** — **Not** mixed into Rendobar FFmpeg output. Encode jobs only process the provider video (`rendobar-jobs.ts`, `rendobar-encode-path.ts`); catalog audio is a separate **`sound_url`** bed on the **customer mobile** full-screen player (`apps/customer/app/(app)/explore-video.tsx`). Web customer Explore uses native `<video>` only — no second audio track.
- **`duration_ms` on signed upload** is client-reported; **ffprobe** on webhook is authoritative.
- **Timed overlays (`start_ms` / `end_ms`)** — honored in **players**; Rendobar v1 only burns **whole-clip** layers (no `enable=` drawtext chain).
- **User trim (WhatsApp-style)** — provider web (`ExploreVideoTrimModal`) and mobile (`ExploreVideoTrimSheet`) pick a sliding window before upload; encode honors **`trim_*`** on the slide. Without trim metadata, encode defaults to the first **`max_duration_ms`**.

See also: [EXPLORE_MEDIA_STAGING_SIGNOFF.md](./EXPLORE_MEDIA_STAGING_SIGNOFF.md).
