import { withStorageListThumbnail } from "@/lib/supabase/storage-list-thumbnail";

describe("withStorageListThumbnail", () => {
  it("returns null for empty input", () => {
    expect(withStorageListThumbnail(null)).toBeNull();
    expect(withStorageListThumbnail("")).toBeNull();
    expect(withStorageListThumbnail("   ")).toBeNull();
  });

  it("passes through non-storage URLs unchanged", () => {
    const url = "https://cdn.example.com/logo.png";
    expect(withStorageListThumbnail(url)).toBe(url);
  });

  it("appends width transform to Supabase public object URLs", () => {
    const url = "https://x.supabase.co/storage/v1/object/public/bucket/path.jpg";
    expect(withStorageListThumbnail(url, 320)).toBe(
      "https://x.supabase.co/storage/v1/object/public/bucket/path.jpg?width=320&quality=80",
    );
  });

  it("does not double-transform URLs that already have width or render path", () => {
    const withWidth =
      "https://x.supabase.co/storage/v1/object/public/bucket/path.jpg?width=200";
    const withRender = "https://x.supabase.co/storage/v1/render/image/public/bucket/path.jpg";
    expect(withStorageListThumbnail(withWidth)).toBe(withWidth);
    expect(withStorageListThumbnail(withRender)).toBe(withRender);
  });
});
