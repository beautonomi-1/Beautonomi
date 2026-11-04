import {
  mapPickerAsset,
  isVideoAsset,
  mapCameraCaptureToAsset,
  validatePickedAssetForExplore,
} from "@/lib/explore-picked-asset";

jest.mock("@/lib/explore-upload-uri", () => ({
  localUriSizeBytes: jest.fn(async () => 50),
}));

describe("explore-picked-asset", () => {
  it("maps picker duration as milliseconds", () => {
    const asset = mapPickerAsset({
      uri: "file:///v.mp4",
      type: "video",
      duration: 12_500,
    });
    expect(asset.source_duration_ms).toBe(12_500);
    expect(isVideoAsset(asset)).toBe(true);
  });

  it("rejects camera capture over video byte cap", async () => {
    const picked = mapCameraCaptureToAsset({
      uri: "file:///big.mp4",
      mimeType: "video/mp4",
      fileName: "big.mp4",
      isVideo: true,
      source_duration_ms: 8000,
    });
    const result = await validatePickedAssetForExplore(picked, { max_video_bytes: 40 });
    expect(result).toEqual({ ok: false, reason: "tooLarge" });
  });
});
