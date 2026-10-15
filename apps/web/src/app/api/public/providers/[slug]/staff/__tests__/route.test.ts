import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/tenant/require-public-tenant", () => ({
  requirePublicTenant: vi.fn(async () => ({ tenantId: "tenant-za" })),
}));

vi.mock("@/lib/provider/staff-location-scope", () => ({
  resolveStaffLocationScope: vi.fn(async () => ({ staffIds: null })),
}));

type Provider = {
  id: string;
  business_name: string;
  business_type: string;
  user_id: string;
};

type StaffRow = {
  id: string;
  name: string;
  role: string;
  avatar_url: string | null;
  bio: string | null;
  is_active: boolean;
  user_id: string | null;
};

function makeAdmin(fixture: {
  provider: Provider;
  staff: StaffRow[];
  ownerFullName: string | null;
}) {
  return {
    from(table: string) {
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.order = async () => ({ data: fixture.staff, error: null });
      if (table === "providers") {
        b.maybeSingle = async () => ({ data: fixture.provider, error: null });
        return b;
      }
      if (table === "users") {
        b.maybeSingle = async () => ({
          data: { full_name: fixture.ownerFullName },
          error: null,
        });
        return b;
      }
      if (table === "provider_staff") return b;
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

async function getStaff() {
  const { GET } = await import("../route");
  const res = await GET(new Request("http://localhost/api/public/providers/lindi-nails/staff"), {
    params: Promise.resolve({ slug: "lindi-nails" }),
  });
  const json = await res.json();
  return json.data as Array<{ id: string; name: string; role: string | null }>;
}

const freelancer: Provider = {
  id: "prov-1",
  business_name: "Lindi Nails",
  business_type: "freelancer",
  user_id: "user-1",
};

const ownerRow = (name: string): StaffRow => ({
  id: "staff-1",
  name,
  role: "owner",
  avatar_url: null,
  bio: null,
  is_active: true,
  user_id: "user-1",
});

describe("GET /api/public/providers/[slug]/staff", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetSupabaseAdmin.mockReset();
  });

  it("never sends the owner permission to customers", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin({ provider: freelancer, staff: [ownerRow("Lindi Dlamini")], ownerFullName: "Lindi Dlamini" }),
    );
    const data = await getStaff();
    expect(data[0]?.role).toBeNull();
  });

  it("shows the freelancer's onboarding name when the staff row kept the business name", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin({ provider: freelancer, staff: [ownerRow("Lindi Nails")], ownerFullName: "Lindi Dlamini" }),
    );
    const data = await getStaff();
    expect(data[0]?.name).toBe("Lindi Dlamini");
  });

  it("shows the freelancer's onboarding name when the staff row kept the Owner placeholder", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin({ provider: freelancer, staff: [ownerRow("Owner")], ownerFullName: "Lindi Dlamini" }),
    );
    const data = await getStaff();
    expect(data[0]?.name).toBe("Lindi Dlamini");
  });

  it("keeps salon team members' own names and hides their permissions", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin({
        provider: { ...freelancer, business_type: "salon", business_name: "Glow Studio" },
        staff: [
          { ...ownerRow("Glow Studio"), id: "staff-owner" },
          { ...ownerRow("Thandi"), id: "staff-2", role: "employee", user_id: "user-2" },
        ],
        ownerFullName: "Naledi Mokoena",
      }),
    );
    const data = await getStaff();
    expect(data.map((s) => s.role)).toEqual([null, null]);
    expect(data.find((s) => s.id === "staff-2")?.name).toBe("Thandi");
  });

  it("uses the person's name on the no-staff fallback card for a freelancer", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin({ provider: freelancer, staff: [], ownerFullName: "Lindi Dlamini" }),
    );
    const data = await getStaff();
    expect(data).toEqual([
      expect.objectContaining({ id: "provider-prov-1", name: "Lindi Dlamini", role: null }),
    ]);
  });
});
