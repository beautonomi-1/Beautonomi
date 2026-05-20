import { describe, expect, it } from "vitest";
import {
  WEB_PROVIDER_IMAGE_FALLBACK,
  providerAvatarImage,
  providerHeroImage,
  providerHeroImageCandidates,
} from "../provider-images";

describe("provider image helpers", () => {
  it("prefers thumbnail for the initial hero image", () => {
    expect(
      providerHeroImage({
        thumbnail_url: "https://cdn.example.com/hero.jpg",
        avatar_url: "https://cdn.example.com/avatar.jpg",
      }),
    ).toBe("https://cdn.example.com/hero.jpg");
  });

  it("falls back to avatar when no thumbnail exists", () => {
    expect(
      providerHeroImage({
        thumbnail_url: " ",
        avatar_url: "https://cdn.example.com/avatar.jpg",
      }),
    ).toBe("https://cdn.example.com/avatar.jpg");
  });

  it("returns a real bundled fallback instead of the missing placeholder-provider JPG", () => {
    expect(providerHeroImage({ thumbnail_url: null, avatar_url: null })).toBe(
      WEB_PROVIDER_IMAGE_FALLBACK,
    );
    expect(WEB_PROVIDER_IMAGE_FALLBACK).not.toContain("placeholder-provider.jpg");
  });

  it("returns ordered unique candidates for runtime onError fallback", () => {
    expect(
      providerHeroImageCandidates({
        thumbnail_url: "https://cdn.example.com/broken-thumbnail.jpg",
        avatar_url: "https://cdn.example.com/avatar.jpg",
      }),
    ).toEqual([
      "https://cdn.example.com/broken-thumbnail.jpg",
      "https://cdn.example.com/avatar.jpg",
      WEB_PROVIDER_IMAGE_FALLBACK,
    ]);
  });

  it("deduplicates candidates when thumbnail and avatar are the same URL", () => {
    expect(
      providerHeroImageCandidates({
        thumbnail_url: "https://cdn.example.com/photo.jpg",
        avatar_url: "https://cdn.example.com/photo.jpg",
      }),
    ).toEqual(["https://cdn.example.com/photo.jpg", WEB_PROVIDER_IMAGE_FALLBACK]);
  });

  it("returns null for avatar when no provider photo exists so callers can render initials", () => {
    expect(providerAvatarImage({ thumbnail_url: "", avatar_url: null })).toBeNull();
  });
});
