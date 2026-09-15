import { describe, expect, it } from "vitest";
import { CHEAP_GLOBAL_ROUTING_POLICY, resolveAiPlatformScope } from "@/lib/ai/platform-config-scope";

describe("resolveAiPlatformScope", () => {
  it("defaults superadmin control-plane reads to global", () => {
    const request = new Request("https://app.example/api/admin/control-plane/integrations/ai?environment=production");
    expect(resolveAiPlatformScope(request, null, "tenant-host-1", "superadmin")).toEqual({
      scope: "global",
      tenantId: null,
    });
  });

  it("honors explicit scope=tenant for superadmin", () => {
    const request = new Request(
      "https://app.example/api/admin/control-plane/integrations/ai?environment=production&scope=tenant",
    );
    expect(resolveAiPlatformScope(request, null, "tenant-host-1", "superadmin")).toEqual({
      scope: "tenant",
      tenantId: "tenant-host-1",
    });
  });

  it("binds non-superadmin to host tenant", () => {
    const request = new Request("https://app.example/api/admin/control-plane/integrations/ai");
    expect(resolveAiPlatformScope(request, null, "tenant-host-1", "admin")).toEqual({
      scope: "tenant",
      tenantId: "tenant-host-1",
    });
  });
});

describe("CHEAP_GLOBAL_ROUTING_POLICY", () => {
  it("parses as JSON with lite default and flash escalation tasks", () => {
    const parsed = JSON.parse(CHEAP_GLOBAL_ROUTING_POLICY) as {
      defaultTier: string;
      taskTier: Record<string, string>;
    };
    expect(parsed.defaultTier).toBe("lite");
    expect(parsed.taskTier.copilot).toBe("flash");
  });
});
