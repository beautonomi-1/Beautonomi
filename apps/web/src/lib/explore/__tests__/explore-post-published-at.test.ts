import { describe, expect, it } from "vitest";
import { explorePostPublishedAtForWrite } from "@/lib/explore/explore-post-published-at";

describe("explorePostPublishedAtForWrite", () => {
  const now = "2026-11-04T15:22:12.000Z";

  it("stores null published_at for drafts so they are not stamped as published", () => {
    expect(explorePostPublishedAtForWrite("draft", now)).toBeNull();
    expect(explorePostPublishedAtForWrite(undefined, now)).toBeNull();
  });

  it("sets published_at when the post is published", () => {
    expect(explorePostPublishedAtForWrite("published", now)).toBe(now);
  });
});
