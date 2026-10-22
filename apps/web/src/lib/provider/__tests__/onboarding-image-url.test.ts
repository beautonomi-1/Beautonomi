import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isTrustedOnboardingImageUrl } from "../onboarding-image-url";

describe("isTrustedOnboardingImageUrl", () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  });

  it("accepts data URLs", () => {
    expect(isTrustedOnboardingImageUrl("data:image/png;base64,abc")).toBe(true);
  });

  it("accepts public storage URLs from this project", () => {
    expect(
      isTrustedOnboardingImageUrl(
        "https://proj.supabase.co/storage/v1/object/public/product-images/x.jpg",
      ),
    ).toBe(true);
  });

  it("rejects arbitrary external URLs", () => {
    expect(isTrustedOnboardingImageUrl("https://example.com/x.jpg")).toBe(false);
  });

  it("rejects internal/metadata URLs", () => {
    expect(isTrustedOnboardingImageUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
  });

  it("rejects file protocol", () => {
    expect(isTrustedOnboardingImageUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isTrustedOnboardingImageUrl("not a url")).toBe(false);
    expect(isTrustedOnboardingImageUrl("")).toBe(false);
  });

  it("rejects own-origin URLs outside public storage", () => {
    expect(isTrustedOnboardingImageUrl("https://proj.supabase.co/rest/v1/users")).toBe(false);
  });
});
