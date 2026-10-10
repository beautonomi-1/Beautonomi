import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "../../../../../..");
function readMigration(name: string): string {
  return readFileSync(join(repoRoot, "supabase/migrations", name), "utf8");
}
import { mapExplorePostRow } from "@/lib/explore/post-mapper";
import {
  denormalizeFirstSlideFromMeta,
  mergeExploreMediaMetaPatch,
  validateProviderMediaPaths,
  postNeedsVideoProcessing,
} from "@/lib/explore/media-meta";
import { collectExplorePostStoragePaths } from "@/lib/explore/storage-paths";
import {
  firstSlideIsVideo,
  isExploreVideoPathOrUrl,
  resolveExploreVideoSrc,
} from "@/lib/explore/video-media";
import { enrichExplorePostsWithSoundUrls } from "@/lib/explore/sound-enrich";
import {
  buildEncodeJob,
  buildProbeJob,
  encodeJobCommandForTests,
} from "@/lib/explore/rendobar-jobs";
import {
  parseRendobarCallbackBody,
  playbackPathFromRendobarDeliveries,
  playbackPathFromRendobarOutput,
} from "@/lib/explore/rendobar-callback-envelope";
import { buildExploreVideoEncodeJob } from "@/lib/explore/rendobar-encode-path";
import {
  buildExploreFeedFilterFingerprint,
  cursorFingerprintMatches,
  encodeExplorePostsCursor,
  decodeExplorePostsCursor,
} from "@/lib/explore/explore-feed-cursor";
import { sanitizeExploreTextOverlays } from "@/lib/explore/explore-overlay-schema";
import { assertExplorePathOwnedByProvider } from "@/lib/explore/explore-upload-access";
import { buildVideoDrawtextChain } from "@/lib/explore/explore-rendobar-overlays";
import {
  sanitizeExploreVideoTrim,
  slideExploreVideoTrimStart,
} from "@/lib/explore/explore-video-trim";
import { resolveVideoEncodeTrim } from "@/lib/explore/resolve-video-encode-trim";
import {
  EXPLORE_PLATFORM_SOUND_PREFIX,
  exploreSoundExtensionFromMime,
  isAllowedExploreSoundMime,
  platformSoundObjectPath,
  titleFromSoundFilename,
} from "@/lib/explore/sound-storage";
import { listExploreSoundsForProvider } from "@/lib/explore/list-explore-sounds-for-provider";
import {
  resolveAllowedExploreSoundId,
  resolveExplorePostSoundIdForWrite,
} from "@/lib/explore/validate-explore-sound-id";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/explore/explore-feature-gates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/explore/explore-feature-gates")>();
  return {
    ...actual,
    isExploreTextOverlaysEnabled: vi.fn().mockResolvedValue(true),
    isExploreRendobarAiCaptionsEnabled: vi.fn().mockResolvedValue(false),
    isExploreRendobarTimelineComposeEnabled: vi.fn().mockResolvedValue(false),
    isExploreRendobarSmartCompressionEnabled: vi.fn().mockResolvedValue(false),
  };
});
import { rendobarIntegrationReady } from "@/lib/explore/rendobar-config";
import {
  EXPLORE_CUSTOMER_WEB_PATH,
  isExploreCustomerPublicPath,
} from "@/lib/explore/explore-customer-entry";
import { isCustomerShellPublicRoute } from "@/lib/navigation/customer-shell-public-routes";

const SUPABASE = "https://example.supabase.co";
const PROVIDER = "11111111-1111-1111-1111-111111111111";

describe("explore media parity — E2E-critical units", () => {
  describe("video-media", () => {
    it("detects video extensions", () => {
      expect(isExploreVideoPathOrUrl("explore/p1/foo.mp4")).toBe(true);
      expect(isExploreVideoPathOrUrl("explore/p1/foo.jpg")).toBe(false);
    });

    it("prefers media_meta kind for first slide", () => {
      expect(firstSlideIsVideo(["explore/p/x.jpg"], [{ kind: "video" }])).toBe(true);
      expect(firstSlideIsVideo(["explore/p/x.mp4"], [{ kind: "image" }])).toBe(false);
    });

    it("resolves playback before raw upload path", () => {
      const src = resolveExploreVideoSrc({
        mediaUrls: [`explore/${PROVIDER}/raw.mp4`],
        playbackPath: `explore/${PROVIDER}/playback.mp4`,
        supabaseUrl: SUPABASE,
      });
      expect(src).toContain("playback.mp4");
    });
  });

  describe("media-meta", () => {
    it("denormalizes display from video slide cover", () => {
      const d = denormalizeFirstSlideFromMeta([`explore/${PROVIDER}/raw.mp4`], [
        {
          kind: "video",
          display_path: `explore/${PROVIDER}/cover.jpg`,
          playback_path: `explore/${PROVIDER}/playback.mp4`,
          width: 1080,
          height: 1920,
          duration_ms: 12000,
        },
      ]);
      expect(d.display_path).toContain("cover.jpg");
      expect(d.playback_path).toContain("playback.mp4");
      expect(d.duration_ms).toBe(12000);
    });

    it("rejects media paths outside provider prefix", () => {
      const r = validateProviderMediaPaths(PROVIDER, ["explore/other/file.jpg"]);
      expect(r.ok).toBe(false);
    });

    it("builds meta for mixed carousel", () => {
      const r = validateProviderMediaPaths(
        PROVIDER,
        [`explore/${PROVIDER}/a.jpg`, `explore/${PROVIDER}/b.mp4`],
        [{ kind: "image" }, { kind: "video", status: "probing" }],
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.mediaMeta[0]?.kind).toBe("image");
        expect(r.mediaMeta[1]?.kind).toBe("video");
        expect(postNeedsVideoProcessing(r.mediaMeta)).toBe(true);
      }
    });

    it("persists user trim window on video slides", () => {
      const r = validateProviderMediaPaths(PROVIDER, [`explore/${PROVIDER}/clip.mp4`], [
        {
          kind: "video",
          source_duration_ms: 120_000,
          trim_start_ms: 25_000,
          trim_end_ms: 85_000,
          duration_ms: 60_000,
        },
      ]);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.mediaMeta[0]?.trim_start_ms).toBe(25_000);
        expect(r.mediaMeta[0]?.trim_end_ms).toBe(85_000);
        expect(r.mediaMeta[0]?.duration_ms).toBe(60_000);
        expect(r.mediaMeta[0]?.source_duration_ms).toBe(120_000);
      }
    });
  });

  describe("storage-paths", () => {
    it("collects media, display, playback, and slide paths", () => {
      const paths = collectExplorePostStoragePaths({
        media_urls: [`explore/${PROVIDER}/raw.mp4`],
        display_path: `explore/${PROVIDER}/cover.jpg`,
        playback_path: `explore/${PROVIDER}/playback.mp4`,
        media_meta: [
          {
            kind: "video",
            display_path: `explore/${PROVIDER}/cover.jpg`,
            playback_path: `explore/${PROVIDER}/playback.mp4`,
          },
        ],
      });
      expect(paths).toContain(`explore/${PROVIDER}/raw.mp4`);
      expect(paths).toContain(`explore/${PROVIDER}/cover.jpg`);
      expect(paths).toContain(`explore/${PROVIDER}/playback.mp4`);
    });
  });

  describe("post-mapper", () => {
    it("maps display_url and provider avatar from join row", () => {
      const post = mapExplorePostRow(
        {
          id: "post-1",
          provider_id: PROVIDER,
          caption: "Test",
          media_urls: [`explore/${PROVIDER}/cover.jpg`],
          status: "published",
          published_at: "2026-01-01T00:00:00Z",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          display_path: `explore/${PROVIDER}/cover.jpg`,
          providers: { business_name: "Salon", slug: "salon", avatar_url: "https://cdn/a.png" },
          sound_id: "sound-1",
        },
        { supabaseUrl: SUPABASE, savedIds: new Set(["post-1"]), likedIds: new Set() },
      );
      expect(post.display_url).toContain("cover.jpg");
      expect(post.provider.avatar_url).toBe("https://cdn/a.png");
      expect(post.is_saved).toBe(true);
      expect(post.sound_id).toBe("sound-1");
    });
  });

  describe("sound-enrich", () => {
    it("attaches sound_url for posts with sound_id", async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: "sound-1", storage_path: `explore/${PROVIDER}/sound.mp3` }],
              }),
            }),
          }),
        }),
      } as unknown as Parameters<typeof enrichExplorePostsWithSoundUrls>[0];

      const [out] = await enrichExplorePostsWithSoundUrls(
        supabase,
        [
          {
            id: "p1",
            provider_id: PROVIDER,
            provider: { business_name: "S", slug: "s" },
            caption: null,
            media_urls: [],
            status: "published",
            published_at: "",
            like_count: 0,
            created_at: "",
            updated_at: "",
            sound_id: "sound-1",
          },
        ],
        SUPABASE,
      );
      expect(out.sound_url).toContain("sound.mp3");
    });
  });

  describe("rendobar jobs", () => {
    it("builds probe callback with post and slide", () => {
      const job = buildProbeJob({
        postId: "post-1",
        slideIndex: 0,
        publicObjectUrl: "https://cdn/obj.mp4",
      });
      expect(job.type).toBe("ffprobe");
      expect((job.params as { command?: string })?.command).toBe("https://cdn/obj.mp4");
      expect(String((job.callback as { url?: string })?.url)).toContain("postId=post-1");
      expect(String((job.callback as { url?: string })?.url)).toContain("phase=probe");
    });

    it("builds encode with Rendobar ffmpeg shape (inputs map, params.command, destinations)", () => {
      const job = buildEncodeJob({
        postId: "post-1",
        slideIndex: 0,
        storageConnectionId: "conn-1",
        objectPath: `explore/${PROVIDER}/raw.mp4`,
      });
      expect(job.type).toBe("ffmpeg");
      const inputs = job.inputs as Record<string, string>;
      expect(inputs.source).toContain("storage://conn-1/");
      expect(Array.isArray(job.destinations)).toBe(true);
      const cmd = encodeJobCommandForTests(job);
      expect(cmd).toContain("playback.mp4");
      expect(cmd.indexOf("poster.jpg")).toBeGreaterThan(cmd.indexOf("playback.mp4"));
      expect(cmd).toContain("-frames:v");
    });

    it("adds -t when maxOutputDurationSec is set (auto-trim)", () => {
      const job = buildEncodeJob({
        postId: "post-1",
        slideIndex: 0,
        storageConnectionId: "conn-1",
        objectPath: `explore/${PROVIDER}/raw.mp4`,
        maxOutputDurationSec: 60,
      });
      const cmd = encodeJobCommandForTests(job);
      expect(cmd).toMatch(/-t\s+60/);
    });

    it("parses Rendobar v1 webhook envelope", () => {
      const parsed = parseRendobarCallbackBody({
        version: "1",
        event: "job.completed",
        data: {
          jobId: "job_abc",
          output: { data: { summary: { durationSec: 12.5 } } },
        },
      });
      expect(parsed.event).toBe("job.completed");
      expect(parsed.jobId).toBe("job_abc");
      expect(
        (parsed.output as { data?: { summary?: { durationSec?: number } } })?.data?.summary?.durationSec,
      ).toBe(12.5);
    });

    it("resolves playback path from deliveries or output.files", () => {
      expect(
        playbackPathFromRendobarDeliveries([
          { path: "explore/p1/rendobar/playback.mp4", status: "succeeded" },
        ]),
      ).toContain("playback.mp4");
      expect(
        playbackPathFromRendobarOutput({
          files: [{ path: "playback.mp4", url: "https://example.com/x" }],
        }),
      ).toBe("playback.mp4");
    });
  });

  describe("rendobar encode path", () => {
    it("uses v1 ffmpeg job while future capability flags are off", async () => {
      const job = await buildExploreVideoEncodeJob({
        postId: "p1",
        slideIndex: 0,
        storageConnectionId: "conn",
        objectPath: `explore/${PROVIDER}/raw.mp4`,
      });
      expect(job.type).toBe("ffmpeg");
    });
  });

  describe("rendobar-config", () => {
    it("requires api key, storage connection, callback secret, and public APP_URL", () => {
      const prev = process.env.APP_URL;
      process.env.APP_URL = "https://app.example.com";
      try {
        expect(
          rendobarIntegrationReady({ apiKey: "k", callbackSecret: "cbsec", storageConnectionId: "c" }),
        ).toBe(true);
        expect(
          rendobarIntegrationReady({ apiKey: "k", callbackSecret: null, storageConnectionId: "c" }),
        ).toBe(false);
        expect(rendobarIntegrationReady({ apiKey: null, callbackSecret: "s", storageConnectionId: "c" })).toBe(
          false,
        );
      } finally {
        if (prev === undefined) delete process.env.APP_URL;
        else process.env.APP_URL = prev;
      }
    });
  });

  describe("feed cursor fingerprint", () => {
    it("rejects cursor when filter fingerprint mismatches", () => {
      const fpA = buildExploreFeedFilterFingerprint({
        sortMode: "chronological",
        followingOnly: false,
        categorySlug: null,
        filterTags: null,
        searchQuery: null,
        lat: null,
        lng: null,
        radiusKm: 50,
        city: null,
      });
      const fpB = buildExploreFeedFilterFingerprint({
        sortMode: "trending",
        followingOnly: false,
        categorySlug: null,
        filterTags: null,
        searchQuery: null,
        lat: null,
        lng: null,
        radiusKm: 50,
        city: null,
      });
      const cursor = encodeExplorePostsCursor({ published_at: "2020-01-01", id: "x" }, fpA);
      const decoded = decodeExplorePostsCursor(cursor);
      expect(decoded?.fp).toBe(fpA);
      expect(cursorFingerprintMatches(String(decoded?.fp), fpA)).toBe(true);
      expect(cursorFingerprintMatches(String(decoded?.fp), fpB)).toBe(false);
    });
  });

  describe("overlay schema & upload paths", () => {
    it("sanitizes overlay text layers", () => {
      const ok = sanitizeExploreTextOverlays([
        { text: "Hi", x: 0.5, y: 0.5, font_size: 0.06, color: "#ffffff" },
      ]);
      expect(ok?.length).toBe(1);
      expect(sanitizeExploreTextOverlays([{ text: "x", x: 2, y: 0.5, font_size: 0.06, color: "#fff" }])).toBeNull();
    });

    it("mergeExploreMediaMetaPatch preserves probe fields while updating overlays", () => {
      const urls = [`explore/${PROVIDER}/a.jpg`, `explore/${PROVIDER}/b.mp4`];
      const existing = [
        { kind: "image" as const, display_path: `explore/${PROVIDER}/d.jpg`, probe_job_id: "keep" },
        { kind: "video" as const, status: "encoding" as const },
      ];
      const merged = mergeExploreMediaMetaPatch(existing, urls, [
        { text_overlays: [{ text: "New", x: 0.5, y: 0.5, font_size: 0.06, color: "#ffffff" }] },
      ]);
      expect(merged[0]?.probe_job_id).toBe("keep");
      expect(merged[0]?.text_overlays?.[0]?.text).toBe("New");
      expect(merged[1]?.status).toBe("encoding");
    });

    it("mergeExploreMediaMetaPatch infers kind from media path when patch omits it", () => {
      const urls = [`explore/${PROVIDER}/clip.mp4`];
      const merged = mergeExploreMediaMetaPatch([], urls, [{ duration_ms: 12_000 }]);
      expect(merged[0]?.kind).toBe("video");
      expect(merged[0]?.duration_ms).toBe(12_000);
    });

    it("validateProviderMediaPaths keeps text_overlays", () => {
      const r = validateProviderMediaPaths(PROVIDER, [`explore/${PROVIDER}/post-1.jpg`], [
        {
          kind: "image",
          display_path: `explore/${PROVIDER}/display-1.jpg`,
          text_overlays: [{ text: "Glow", x: 0.5, y: 0.4, font_size: 0.05, color: "#ffffff" }],
        },
      ]);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.mediaMeta[0]?.text_overlays?.[0]?.text).toBe("Glow");
    });

    it("provider path guard for finalize", () => {
      expect(assertExplorePathOwnedByProvider(`explore/${PROVIDER}/post.jpg`, PROVIDER)).toBe(true);
      expect(assertExplorePathOwnedByProvider(`explore/other/post.jpg`, PROVIDER)).toBe(false);
    });
  });

  describe("rendobar drawtext v1", () => {
    it("burns whole-clip overlays only (skips timed layers)", async () => {
      const chain = await buildVideoDrawtextChain([
        { text: "Always", x: 0.5, y: 0.5, font_size: 0.06, color: "#ffffff" },
        {
          text: "Timed",
          x: 0.5,
          y: 0.2,
          font_size: 0.06,
          color: "#ffffff",
          start_ms: 0,
          end_ms: 3000,
        },
      ]);
      expect(chain).toBeTruthy();
      expect(chain).toContain("Always");
      expect(chain).not.toContain("Timed");
    });
  });

  describe("video trim window", () => {
    it("honors trim_start_ms of zero when end is set", () => {
      const trim = sanitizeExploreVideoTrim(120_000, 60_000, {
        trim_start_ms: 0,
        trim_end_ms: 60_000,
      });
      expect(trim?.trim_start_ms).toBe(0);
      expect(trim?.trim_end_ms).toBe(60_000);
    });

    it("slides a fixed-length window for long sources", () => {
      const trim = slideExploreVideoTrimStart(45_000, 120_000, 60_000);
      expect(trim.trim_start_ms).toBe(45_000);
      expect(trim.trim_end_ms).toBe(105_000);
    });

    it("maps user trim to ffmpeg -ss and -t via encode job", () => {
      const resolved = resolveVideoEncodeTrim({
        slide: {
          kind: "video",
          source_duration_ms: 120_000,
          trim_start_ms: 30_000,
          trim_end_ms: 90_000,
          duration_ms: 60_000,
        },
        sourceDurationSec: 120,
        platformMaxMs: 60_000,
      });
      expect(resolved.trimStartSec).toBe(30);
      expect(resolved.outputDurationSec).toBe(60);
      const job = buildEncodeJob({
        postId: "p1",
        slideIndex: 0,
        storageConnectionId: "conn",
        objectPath: `explore/${PROVIDER}/raw.mp4`,
        trimStartSec: resolved.trimStartSec,
        maxOutputDurationSec: resolved.outputDurationSec,
      });
      const cmd = encodeJobCommandForTests(job);
      expect(cmd).toMatch(/-ss\s+30/);
      expect(cmd).toContain("-t");
    });
  });

  describe("encode job dual vf", () => {
    it("applies the same -vf to poster and playback when custom filter set", () => {
      const job = buildEncodeJob({
        postId: "p1",
        slideIndex: 0,
        storageConnectionId: "conn",
        objectPath: `explore/${PROVIDER}/raw.mp4`,
        videoFilter: "scale=1080:-2,drawtext=text='Hi'",
        posterSeekSec: 1,
      });
      const cmd = encodeJobCommandForTests(job);
      const vfMatches = cmd.match(/-vf\s+'([^']+)'/g) ?? cmd.match(/-vf\s+(\S+)/g) ?? [];
      expect(vfMatches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("migrations & ops wiring", () => {
    it("979 defines explore media parity schema and flags", () => {
      const sql = readMigration("979_explore_media_parity.sql");
      expect(sql).toContain("display_path");
      expect(sql).toContain("media_meta");
      expect(sql).toContain("explore_sounds");
      expect(sql).toContain("explore_watch_progress");
      expect(sql).toContain("parent_id");
      expect(sql).toContain("explore.enabled");
      expect(sql).toContain("explore.video_transcode");
    });

    it("980 refreshes explore_saved_list with display columns", () => {
      const sql = readMigration("980_explore_saved_list_media_parity.sql");
      expect(sql).toContain("explore_saved_list");
      expect(sql).toMatch(/display_path|display_url/i);
    });

    it("981 seeds future Rendobar flags default off", () => {
      const sql = readMigration("981_explore_rendobar_future_flags.sql");
      expect(sql).toContain("explore.rendobar_ai_captions");
      expect(sql).toContain("explore.rendobar_timeline_compose");
      expect(sql).toContain("explore.rendobar_smart_compression");
      expect(sql).toMatch(/false,\s*\n\s*'explore'/);
    });

    it("registers /explore as customer shell public route and entry contract", () => {
      expect(EXPLORE_CUSTOMER_WEB_PATH).toBe("/explore");
      expect(isExploreCustomerPublicPath("/explore/saved")).toBe(true);
      expect(isCustomerShellPublicRoute("/explore")).toBe(true);
      const tabsLayout = readFileSync(
        join(repoRoot, "apps/customer/app/(app)/(tabs)/_layout.tsx"),
        "utf8",
      );
      expect(tabsLayout).toContain('name="explore" options={{ href: null }}');
    });

    it("registers explore media backfill cron", () => {
      const vercel = readFileSync(join(repoRoot, "apps/web/vercel.json"), "utf8");
      expect(vercel).toContain("/api/cron/explore-media-backfill");
    });

    it("rendobar webhook uses durable lease RPC", () => {
      const src = readFileSync(
        join(repoRoot, "apps/web/src/app/api/webhooks/rendobar/route.ts"),
        "utf8",
      );
      expect(src).toContain("try_acquire_webhook_event_lease");
      expect(src).toContain("pending_gallery_append");
    });

    it("979 seeds explore.sound_catalog feature flag", () => {
      const sql = readMigration("979_explore_media_parity.sql");
      expect(sql).toContain("explore.sound_catalog");
      expect(sql).toContain("explore_sounds");
    });

    it("v1: Rendobar encode path does not mix explore catalog sound", () => {
      for (const rel of [
        "apps/web/src/lib/explore/rendobar-jobs.ts",
        "apps/web/src/lib/explore/rendobar-encode-path.ts",
        "apps/web/src/lib/explore/enqueue-video-processing.ts",
        "apps/web/src/app/api/webhooks/rendobar/route.ts",
      ]) {
        const src = readFileSync(join(repoRoot, rel), "utf8");
        expect(src).not.toMatch(/\bsound_id\b/);
        expect(src).not.toMatch(/\bexplore_sounds\b/);
      }
    });

    it("v1: web customer Explore UI has no sound bed (mobile explore-video only)", () => {
      const webExploreDir = join(repoRoot, "apps/web/src/components/explore");
      const names = ["ExplorePostDetail.tsx", "ExploreFeed.tsx", "ExplorePostCard.tsx"];
      for (const name of names) {
        const src = readFileSync(join(webExploreDir, name), "utf8");
        expect(src).not.toContain("sound_url");
        expect(src).not.toMatch(/ExploreSoundBed/);
      }
      const customerVideo = readFileSync(
        join(repoRoot, "apps/customer/app/(app)/explore-video.tsx"),
        "utf8",
      );
      expect(customerVideo).toContain("ExploreSoundBed");
      expect(customerVideo).toContain("sound_url");
    });

    it("v1: admin platform sounds — hide only, no DELETE handler", () => {
      const adminSounds = readFileSync(
        join(repoRoot, "apps/web/src/app/api/admin/explore/sounds/route.ts"),
        "utf8",
      );
      expect(adminSounds).toContain("is_hidden");
      expect(adminSounds).not.toMatch(/export async function DELETE/);
      const adminPage = readFileSync(
        join(repoRoot, "apps/admin-web/src/routes/content/ExploreSoundsPage.tsx"),
        "utf8",
      );
      expect(adminPage).toContain("is_hidden");
      expect(adminPage).not.toMatch(/\bDelete\b.*sound/i);
    });
  });

  describe("sound catalog helpers", () => {
    it("validates sound MIME types and platform object paths", () => {
      expect(isAllowedExploreSoundMime("audio/mpeg")).toBe(true);
      expect(isAllowedExploreSoundMime("audio/mp4")).toBe(true);
      expect(isAllowedExploreSoundMime("audio/wav")).toBe(false);
      expect(exploreSoundExtensionFromMime("audio/mpeg")).toBe("mp3");
      expect(exploreSoundExtensionFromMime("audio/x-m4a")).toBe("m4a");
      const path = platformSoundObjectPath("audio/mpeg");
      expect(path.startsWith(EXPLORE_PLATFORM_SOUND_PREFIX)).toBe(true);
      expect(path.endsWith(".mp3")).toBe(true);
      expect(titleFromSoundFilename("my-track_name.mp3")).toBe("my track name");
    });

    it("resolveAllowedExploreSoundId allows platform and own provider sounds only", async () => {
      const rows: Record<string, { owner_type: string; provider_id: string | null; is_hidden: boolean }> =
        {
          "plat-1": { owner_type: "platform", provider_id: null, is_hidden: false },
          "other-1": { owner_type: "provider", provider_id: "00000000-0000-0000-0000-000000000099", is_hidden: false },
          "mine-1": { owner_type: "provider", provider_id: PROVIDER, is_hidden: false },
          "hidden-1": { owner_type: "platform", provider_id: null, is_hidden: true },
        };
      const makeSupabase = (_id: string) =>
        ({
          from: () => ({
            select: () => ({
              eq: (_c: string, soundId: string) => ({
                maybeSingle: () => {
                  const row = rows[soundId];
                  return Promise.resolve(
                    row ? { data: { id: soundId, ...row } } : { data: null },
                  );
                },
              }),
            }),
          }),
        }) as unknown as SupabaseClient;

      await expect(
        resolveAllowedExploreSoundId(makeSupabase("plat-1"), "plat-1", PROVIDER),
      ).resolves.toEqual({ ok: true, id: "plat-1" });
      await expect(
        resolveAllowedExploreSoundId(makeSupabase("mine-1"), "mine-1", PROVIDER),
      ).resolves.toEqual({ ok: true, id: "mine-1" });
      await expect(
        resolveAllowedExploreSoundId(makeSupabase("other-1"), "other-1", PROVIDER),
      ).resolves.toEqual({ ok: false, message: "Sound not available for this provider" });
      await expect(
        resolveAllowedExploreSoundId(makeSupabase("hidden-1"), "hidden-1", PROVIDER),
      ).resolves.toEqual({ ok: false, message: "Sound is not available" });
    });

    it("resolveExplorePostSoundIdForWrite rejects when catalog disabled", async () => {
      const supabase = { from: vi.fn() } as unknown as SupabaseClient;
      const out = await resolveExplorePostSoundIdForWrite(supabase, "sound-1", PROVIDER, {
        catalogEnabled: false,
        hasVideoMedia: true,
      });
      expect(out).toEqual({ ok: false, message: "Sound catalog is disabled" });
    });

    it("resolveExplorePostSoundIdForWrite rejects sound on non-video posts", async () => {
      const supabase = { from: vi.fn() } as unknown as SupabaseClient;
      const out = await resolveExplorePostSoundIdForWrite(supabase, "sound-1", PROVIDER, {
        catalogEnabled: true,
        hasVideoMedia: false,
      });
      expect(out).toEqual({
        ok: false,
        message: "Background sound requires the first slide to be a video",
      });
    });

    it("listExploreSoundsForProvider returns platform rows before provider rows", async () => {
      const platformRow = {
        id: "p1",
        title: "Platform A",
        storage_path: "explore/platform/a.mp3",
        duration_ms: null,
        is_hidden: false,
        created_at: "2020-01-01",
        owner_type: "platform",
      };
      const providerRow = {
        id: "v1",
        title: "Mine B",
        storage_path: "explore/p1/b.mp3",
        duration_ms: 1000,
        is_hidden: false,
        created_at: "2021-01-01",
        owner_type: "provider",
      };

      const supabase = {
        from: () => ({
          select: () => {
            const filters: Record<string, unknown> = {};
            const chain = {
              eq: (col: string, val: unknown) => {
                filters[col] = val;
                return chain;
              },
              order: () => {
                if (filters.owner_type === "platform") {
                  return Promise.resolve({ data: [platformRow] });
                }
                if (filters.owner_type === "provider") {
                  return Promise.resolve({ data: [providerRow] });
                }
                return Promise.resolve({ data: [] });
              },
            };
            return chain;
          },
        }),
      } as unknown as SupabaseClient;

      const list = await listExploreSoundsForProvider(supabase, PROVIDER, SUPABASE);
      expect(list.map((s) => s.id)).toEqual(["p1", "v1"]);
      expect(list[0]?.source).toBe("platform");
      expect(list[1]?.source).toBe("provider");
      expect(list[0]?.public_url).toContain("explore/platform/a.mp3");
    });
  });
});
