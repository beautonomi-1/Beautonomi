import { describe, expect, it } from "vitest";
import { FetchError, isHtmlRoutingFetchError, isTransientNetworkFetchError } from "../fetcher";

describe("HTML routing fetch errors", () => {
  it("treats Turbopack HTML 404s as retryable in dev", () => {
    const err = new FetchError(
      "API route not found: the server returned an HTML page instead of JSON.",
      404,
      "NOT_FOUND_HTML",
    );
    expect(isHtmlRoutingFetchError(err)).toBe(true);
    expect(isTransientNetworkFetchError(err)).toBe(true);
  });
});
