import { describe, expect, it } from "vitest";
import { resetExploreVideoSlidesForReprocess } from "@/lib/explore/reset-explore-video-slides";

describe("resetExploreVideoSlidesForReprocess", () => {
  it("clears failed video slide job fields and retry count", () => {
    const out = resetExploreVideoSlidesForReprocess([
      { kind: "image" },
      {
        kind: "video",
        status: "failed",
        error_code: "ENCODE_FAILED",
        probe_job_id: "p1",
        encode_job_id: "e1",
        retry_count: 2,
      },
    ]);
    expect(out[0].kind).toBe("image");
    expect(out[1]).toMatchObject({
      kind: "video",
      status: null,
      error_code: null,
      probe_job_id: null,
      encode_job_id: null,
      playback_path: null,
      retry_count: 0,
    });
  });

  it("skips delivered slides unless forceAllVideo", () => {
    const meta = [
      {
        kind: "video" as const,
        status: "delivered" as const,
        playback_path: "https://cdn.example/v.mp4",
        encode_job_id: "e-done",
      },
    ];
    expect(resetExploreVideoSlidesForReprocess(meta)[0].encode_job_id).toBe("e-done");
    expect(resetExploreVideoSlidesForReprocess(meta, { forceAllVideo: true })[0].encode_job_id).toBeNull();
  });
});
