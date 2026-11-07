import { beforeEach, describe, expect, it, vi } from "vitest";

const appendGalleryDisplayImage = vi.fn(async () => true);

vi.mock("@/lib/explore/publish-side-effects", () => ({
  appendGalleryDisplayImage: (...args: unknown[]) => appendGalleryDisplayImage(...args),
}));

describe("explore-post-gallery sync helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncExplorePostGalleryOnUnhide skips when added_to_gallery is false", async () => {
    const { syncExplorePostGalleryOnUnhide } = await import("../explore-post-gallery");
    await syncExplorePostGalleryOnUnhide({
      id: "post-1",
      provider_id: "prov-1",
      added_to_gallery: false,
      media_urls: ["/explore/a.jpg"],
      media_meta: [],
    });
    expect(appendGalleryDisplayImage).not.toHaveBeenCalled();
  });

  it("syncExplorePostGalleryOnUnhide re-appends when added_to_gallery is true", async () => {
    const { syncExplorePostGalleryOnUnhide } = await import("../explore-post-gallery");
    await syncExplorePostGalleryOnUnhide({
      id: "post-1",
      provider_id: "prov-1",
      display_path: "/explore/poster.jpg",
      added_to_gallery: true,
      media_urls: ["/explore/v.mp4"],
      media_meta: [{ kind: "video", display_path: "/explore/poster.jpg" }],
    });
    expect(appendGalleryDisplayImage).toHaveBeenCalledWith(
      "prov-1",
      "/explore/poster.jpg",
      ["/explore/v.mp4"],
      [{ kind: "video", display_path: "/explore/poster.jpg" }],
      "post-1",
    );
  });

  it("strips the public URL that publish appends from a storage path", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
    const stored = "https://proj.supabase.co/storage/v1/object/public/explore-posts/explore/a.jpg";
    const updates: string[][] = [];
    const supabase = galleryClient(
      [stored, "https://cdn.example/manual/b.jpg"],
      updates,
    );
    const { removeExplorePostUrlsFromProviderGallery } = await import("../explore-post-gallery");
    await removeExplorePostUrlsFromProviderGallery(supabase, "prov-1", "explore/a.jpg", [], []);
    expect(updates[0]).toEqual(["https://cdn.example/manual/b.jpg"]);
  });

  it("strips a gallery URL stored as a full https media url", async () => {
    const full = "https://proj.supabase.co/storage/v1/object/public/explore-posts/explore/full.jpg";
    const updates: string[][] = [];
    const supabase = galleryClient([full, "https://cdn.example/manual/b.jpg"], updates);
    const { removeExplorePostUrlsFromProviderGallery } = await import("../explore-post-gallery");
    await removeExplorePostUrlsFromProviderGallery(supabase, "prov-1", null, [full], []);
    expect(updates[0]).toEqual(["https://cdn.example/manual/b.jpg"]);
  });
});

function galleryClient(gallery: string[], updates: string[][]) {
  return {
    from: vi.fn((table: string) => {
      if (table !== "providers") return {};
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { gallery } })),
          })),
        })),
        update: vi.fn((payload: { gallery: string[] }) => ({
          eq: vi.fn(async () => {
            updates.push(payload.gallery);
            return { error: null };
          }),
        })),
      };
    }),
  } as never;
}
