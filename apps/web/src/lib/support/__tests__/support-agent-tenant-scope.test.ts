import { describe, expect, it, vi } from "vitest";
import {
  applySupportAgentTicketScope,
  resolveSupportAgentTicketTenantIds,
} from "@/lib/support/support-agent-tenant-scope";

describe("support agent ticket scope", () => {
  it("does not tenant-filter staff roles", async () => {
    const from = vi.fn();
    const ids = await resolveSupportAgentTicketTenantIds({ from } as never, {
      role: "superadmin",
      userId: "user-1",
    });
    expect(ids).toBeNull();
    expect(from).not.toHaveBeenCalled();

    const query = { in: vi.fn() };
    expect(applySupportAgentTicketScope(query, ids)).toBe(query);
    expect(query.in).not.toHaveBeenCalled();
  });

  it("restricts a support_agent to assigned tenants without executing the builder", async () => {
    const tenantId = "c43f7511-ca1b-4ccd-a0b9-27056531c65b";
    const roles = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: undefined as unknown,
    };
    roles.then = (resolve: (value: unknown) => void) =>
      resolve({ data: [{ tenant_id: tenantId }], error: null });
    const from = vi.fn().mockReturnValue(roles);

    const ids = await resolveSupportAgentTicketTenantIds({ from } as never, {
      role: "support_agent",
      userId: "agent-1",
    });
    expect(ids).toEqual([tenantId]);

    let executed = false;
    const query = {
      in: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnValue("paged"),
      then(resolve: (value: unknown) => void) {
        executed = true;
        resolve({ data: [], error: null });
      },
    };
    const scoped = applySupportAgentTicketScope(query, ids);
    expect(executed).toBe(false);
    expect(query.in).toHaveBeenCalledWith("tenant_id", [tenantId]);
    expect(scoped.range(0, 24)).toBe("paged");
  });
});
