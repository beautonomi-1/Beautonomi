import { describe, expect, it } from "vitest";
import { resolveWebMaintenanceFetch } from "@/lib/maintenance-web-path-scope";

describe("resolveWebMaintenanceFetch", () => {
  it("classifies provider portal vs funnel paths", () => {
    expect(resolveWebMaintenanceFetch("/provider")).toEqual({
      mode: "provider_web",
      pathVariant: "portal",
    });
    expect(resolveWebMaintenanceFetch("/provider/calendar")).toEqual({
      mode: "provider_web",
      pathVariant: "portal",
    });
    expect(resolveWebMaintenanceFetch("/provider/onboarding")).toEqual({
      mode: "provider_web",
      pathVariant: "funnel",
    });
    expect(resolveWebMaintenanceFetch("/provider/get-started")).toEqual({
      mode: "provider_web",
      pathVariant: "funnel",
    });
    expect(resolveWebMaintenanceFetch("/provider/subscription-checkout")).toEqual({
      mode: "provider_web",
      pathVariant: "funnel",
    });
    expect(resolveWebMaintenanceFetch("/provider/embed")).toEqual({
      mode: "provider_web",
      pathVariant: "funnel",
    });
  });

  it("exempts public partner funnel and auth paths", () => {
    expect(resolveWebMaintenanceFetch("/become-a-partner")).toEqual({ mode: "none" });
    expect(resolveWebMaintenanceFetch("/login")).toEqual({ mode: "none" });
    expect(resolveWebMaintenanceFetch("/signup")).toEqual({ mode: "none" });
    expect(resolveWebMaintenanceFetch("/signup/extra")).toEqual({ mode: "none" });
    expect(resolveWebMaintenanceFetch("/pricing")).toEqual({ mode: "none" });
    expect(resolveWebMaintenanceFetch("/why-beautonomi")).toEqual({ mode: "none" });
  });

  it("gates typical marketing/booking paths to public_site", () => {
    expect(resolveWebMaintenanceFetch("/")).toEqual({ mode: "public_site" });
    expect(resolveWebMaintenanceFetch("/book/foo")).toEqual({ mode: "public_site" });
    expect(resolveWebMaintenanceFetch("/explore")).toEqual({ mode: "public_site" });
  });

  it("exempts operational prefixes", () => {
    expect(resolveWebMaintenanceFetch("/admin/dashboard")).toEqual({ mode: "none" });
    expect(resolveWebMaintenanceFetch("/auth/callback")).toEqual({ mode: "none" });
    expect(resolveWebMaintenanceFetch("/api/foo")).toEqual({ mode: "none" });
  });
});
