import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../route";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAdminSection: vi.fn().mockResolvedValue({ user: { id: "admin" } }),
  };
});

const getSupabaseServer = (await import("@/lib/supabase/server")).getSupabaseServer as ReturnType<
  typeof vi.fn
>;

describe("POST preview-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns finalized html and plain text without sending", async () => {
    getSupabaseServer.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => ({
                data: {
                  key: "booking_confirmed",
                  email_subject: "Booking confirmed",
                  email_body: "<p>Hello {{provider_name}}</p>",
                  body: "push body",
                  url: "/bookings/{{booking_id}}",
                  variables: ["provider_name", "booking_id"],
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    const req = new Request("http://localhost/api/admin/notification-templates/booking_confirmed/preview-email", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await POST(req as never, { params: Promise.resolve({ key: "booking_confirmed" }) });
    const json = await res.json();
    expect(json.data.html).toContain("max-width:640px");
    expect(json.data.text).not.toMatch(/<p>/);
    expect(json.data.subject).toContain("Booking confirmed");
  });
});
