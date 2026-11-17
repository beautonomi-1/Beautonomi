import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockHasPermission = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    hasPermission: (...args: unknown[]) => mockHasPermission(...args),
  };
});

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    getProviderIdForUser: async () => "prov-1",
  };
});

const execution = {
  id: "ex-1",
  customer: { id: "c1", full_name: "Ada", email: "ada@example.com", phone: "0820000000" },
};

function from(table: string) {
  if (table === "marketing_automations") {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => ({ data: { id: "auto-1" }, error: null }),
          }),
        }),
      }),
    };
  }
  const result = { data: [execution], error: null };
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: async () => ({ from }),
}));

describe("GET /api/provider/automations/[id]/executions contact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "staff-1", role: "provider_staff" },
    });
  });

  it("drops the customer email and phone unless the viewer has view_clients", async () => {
    mockHasPermission.mockResolvedValue(false);
    const { GET } = await import("../[id]/executions/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/automations/auto-1/executions"), {
      params: Promise.resolve({ id: "auto-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].customer.full_name).toBe("Ada");
    expect(body.data[0].customer.email).toBeNull();
    expect(body.data[0].customer.phone).toBeNull();
    expect(execution.customer.email).toBe("ada@example.com");
  });

  it("keeps the customer email and phone for a viewer with view_clients", async () => {
    mockHasPermission.mockResolvedValue(true);
    const { GET } = await import("../[id]/executions/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/automations/auto-1/executions"), {
      params: Promise.resolve({ id: "auto-1" }),
    });
    const body = await res.json();
    expect(body.data[0].customer.email).toBe("ada@example.com");
    expect(body.data[0].customer.phone).toBe("0820000000");
  });
});
