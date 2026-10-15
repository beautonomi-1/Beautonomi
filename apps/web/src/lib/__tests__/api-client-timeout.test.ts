import { describe, expect, it } from "vitest";
import { isAbortLikeTimeout } from "../../../../../packages/api/src/client";

describe("isAbortLikeTimeout", () => {
  it("returns true when the abort signal was aborted (Expo FetchRequestCanceledException path)", () => {
    const controller = new AbortController();
    controller.abort();
    expect(isAbortLikeTimeout(new Error("FetchRequestCanceledException"), controller.signal)).toBe(
      true,
    );
  });

  it("returns true for AbortError", () => {
    const controller = new AbortController();
    const err = new Error("Aborted");
    err.name = "AbortError";
    expect(isAbortLikeTimeout(err, controller.signal)).toBe(true);
  });

  it("returns false for unrelated network errors", () => {
    const controller = new AbortController();
    expect(isAbortLikeTimeout(new Error("Network request failed"), controller.signal)).toBe(false);
  });
});
