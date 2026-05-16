import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

function createSupabaseForDeviceList() {
  return {
    from: vi.fn((table: string) => {
      if (table === "provider_yoco_devices") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: [
                  {
                    id: "modern-1",
                    name: "Front desk",
                    yoco_device_id: "dev_modern_1",
                    location_id: null,
                    location_name: null,
                    is_active: true,
                    total_transactions: 3,
                    total_amount: 150000,
                    last_used: "2026-05-16T17:00:00.000Z",
                    created_at: "2026-05-16T16:00:00.000Z",
                    updated_at: "2026-05-16T17:00:00.000Z",
                  },
                ],
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "provider_yoco_terminals") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: [
                  // Duplicate by device_id should be deduped
                  {
                    id: "legacy-dup",
                    device_id: "dev_modern_1",
                    device_name: "Legacy duplicate",
                    location_name: "Main",
                    active: true,
                    created_at: "2026-05-16T12:00:00.000Z",
                  },
                  {
                    id: "legacy-1",
                    device_id: "legacy_device_22",
                    device_name: "Legacy terminal",
                    location_name: "Main",
                    active: true,
                    created_at: "2026-05-16T10:00:00.000Z",
                  },
                ],
                error: null,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table queried: ${table}`);
    }),
  };
}

describe("GET /api/provider/yoco/devices", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "provider-user-1" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockGetSupabaseServer.mockResolvedValue(createSupabaseForDeviceList());
  });

  it("returns modern devices and non-duplicated legacy terminals", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/yoco/devices"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(2);

    const modern = body.data.find((d: { id: string }) => d.id === "modern-1");
    expect(modern?.device_id).toBe("dev_modern_1");
    expect(modern?.serial_number).toBe("dev_modern_1");
    expect(modern?.device_type).toBe("web_pos");

    const legacy = body.data.find((d: { id: string }) => d.id === "legacy-1");
    expect(legacy?.device_id).toBe("legacy_device_22");
    expect(legacy?.device_type).toBe("card_machine");
    expect(legacy?.legacy_terminal).toBe(true);
  });
});

