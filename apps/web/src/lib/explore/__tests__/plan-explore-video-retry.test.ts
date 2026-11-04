import { describe, expect, it } from "vitest";
import {
  EXPLORE_VIDEO_STALE_MS,
  exploreVideoSlideNeedsRetry,
  planExploreVideoRetry,
} from "@/lib/explore/plan-explore-video-retry";

const NOW = Date.parse("2026-11-04T12:00:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("exploreVideoSlideNeedsRetry", () => {
  it("retries failed slides", () => {
    expect(exploreVideoSlideNeedsRetry({ kind: "video", status: "failed" }, NOW)).toBe(true);
  });

  it("retries probing/encoding slides older than 30 minutes", () => {
    const stale = iso(EXPLORE_VIDEO_STALE_MS + 1000);
    expect(
      exploreVideoSlideNeedsRetry({ kind: "video", status: "encoding", processing_started_at: stale }, NOW),
    ).toBe(true);
    expect(
      exploreVideoSlideNeedsRetry({ kind: "video", status: "probing", processing_started_at: iso(60_000) }, NOW),
    ).toBe(false);
  });

  it("skips slides at the retry cap", () => {
    expect(exploreVideoSlideNeedsRetry({ kind: "video", status: "failed", retry_count: 3 }, NOW)).toBe(false);
  });

  it("skips delivered and image slides", () => {
    expect(
      exploreVideoSlideNeedsRetry(
        { kind: "video", status: "delivered", playback_path: "explore/p/playback.mp4" },
        NOW,
      ),
    ).toBe(false);
    expect(exploreVideoSlideNeedsRetry({ kind: "image" }, NOW)).toBe(false);
  });
});

describe("planExploreVideoRetry", () => {
  it("resets only slides that need a retry and bumps their count", () => {
    const meta = [
      { kind: "image" as const },
      { kind: "video" as const, status: "failed", error_code: "ENCODE_FAILED", encode_job_id: "e1", retry_count: 1 },
      { kind: "video" as const, status: "encoding", processing_started_at: iso(60_000), encode_job_id: "e2" },
      { kind: "video" as const, status: "failed", retry_count: 3 },
    ];
    const plan = planExploreVideoRetry(meta, NOW);
    expect(plan.retried).toBe(1);
    expect(plan.meta[1]).toMatchObject({ status: null, error_code: null, encode_job_id: null, retry_count: 2 });
    expect(plan.meta[2]).toBe(meta[2]);
    expect(plan.meta[3]).toBe(meta[3]);
  });

  it("returns zero retries when nothing is eligible", () => {
    const plan = planExploreVideoRetry([{ kind: "video", status: "failed", retry_count: 3 }], NOW);
    expect(plan.retried).toBe(0);
  });
});
