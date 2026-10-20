import { describe, expect, it } from "vitest";
import { supportAssistantPlatformForRequest } from "../availability";

function req(xApp?: string) {
  const headers = new Headers();
  if (xApp) headers.set("X-App", xApp);
  return { headers };
}

describe("supportAssistantPlatformForRequest", () => {
  it("matches the platform each client sends to the config bundle", () => {
    expect(supportAssistantPlatformForRequest({ request: req("customer"), requesterType: "customer" })).toBe(
      "customer",
    );
    expect(supportAssistantPlatformForRequest({ request: req(), requesterType: "customer" })).toBe("web");
    expect(supportAssistantPlatformForRequest({ request: req("provider"), requesterType: "provider" })).toBe(
      "provider",
    );
    expect(supportAssistantPlatformForRequest({ request: req(), requesterType: "provider" })).toBe("provider");
    expect(supportAssistantPlatformForRequest({ request: req("customer"), role: "provider_staff" })).toBe(
      "provider",
    );
    expect(supportAssistantPlatformForRequest({ requesterType: "customer" })).toBe("web");
  });
});
