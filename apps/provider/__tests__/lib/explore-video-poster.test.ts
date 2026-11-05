import { exploreThumbnailFileUri } from "@/lib/explore-video-poster";

describe("exploreThumbnailFileUri", () => {
  it("returns a file URI when the thumbnail exposes one", () => {
    expect(exploreThumbnailFileUri({ uri: "file:///cover.jpg" })).toBe("file:///cover.jpg");
    expect(exploreThumbnailFileUri({ localUri: "file:///cover2.jpg" })).toBe("file:///cover2.jpg");
  });

  it("returns null for a shared image ref with no file URI", () => {
    expect(exploreThumbnailFileUri({ width: 120, height: 160 })).toBeNull();
    expect(exploreThumbnailFileUri(null)).toBeNull();
  });
});
