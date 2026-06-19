import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildAccountDeletionCancelUrl,
  parseDeletionCancelToken,
} from "@/lib/account/deletion-cancel-token";

describe("deletion-cancel-token", () => {
  const prevSecret = process.env.ACCOUNT_DELETION_LINK_SECRET;
  const prevAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.ACCOUNT_DELETION_LINK_SECRET = "test-secret-for-deletion-cancel";
    process.env.NEXT_PUBLIC_APP_URL = "https://www.beautonomi.com";
  });

  afterEach(() => {
    process.env.ACCOUNT_DELETION_LINK_SECRET = prevSecret;
    process.env.NEXT_PUBLIC_APP_URL = prevAppUrl;
  });

  it("round-trips signed cancel URL token", () => {
    const purgeAfter = "2026-07-18T12:00:00.000Z";
    const userId = "00000000-0000-4000-8000-000000000099";
    const url = buildAccountDeletionCancelUrl(userId, purgeAfter);
    const token = new URL(url).searchParams.get("t");
    expect(token).toBeTruthy();
    const parsed = parseDeletionCancelToken(token!);
    expect(parsed).toEqual({ userId, purgeAfterAt: purgeAfter });
  });

  it("rejects tampered token", () => {
    const url = buildAccountDeletionCancelUrl("u1", "2026-07-18T12:00:00.000Z");
    const token = new URL(url).searchParams.get("t")!;
    const parsed = parseDeletionCancelToken(token.slice(0, -2) + "xx");
    expect(parsed).toBeNull();
  });
});
