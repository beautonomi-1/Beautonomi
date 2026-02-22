/**
 * Analytics Config API Tests
 */

import { vi } from "vitest";
import { GET } from "../route";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Mock Supabase admin
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

describe("GET /api/public/analytics-config", () => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);
  });

  it("should return config when found", async () => {
    const mockConfig = {
      api_key_public: "test-key",
      environment: "production",
      enabled_client_portal: true,
      enabled_provider_portal: true,
      enabled_admin_portal: true,
      guides_enabled: false,
      surveys_enabled: false,
      sampling_rate: 1.0,
      debug_mode: false,
    };

    mockSupabase.maybeSingle.mockResolvedValue({
      data: mockConfig,
      error: null,
    });

    const request = new NextRequest("http://localhost/api/public/analytics-config");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockConfig);
    expect(mockSupabase.from).toHaveBeenCalledWith("amplitude_integration_config");
    expect(mockSupabase.eq).toHaveBeenCalledWith("environment", "production");
  });

  it("should return safe defaults when config not found", async () => {
    mockSupabase.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const request = new NextRequest("http://localhost/api/public/analytics-config");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      api_key_public: null,
      environment: "production",
      enabled_client_portal: false,
      enabled_provider_portal: false,
      enabled_admin_portal: false,
      guides_enabled: false,
      surveys_enabled: false,
      sampling_rate: 1.0,
      debug_mode: false,
    });
  });

  it("should handle errors gracefully", async () => {
    mockSupabase.maybeSingle.mockRejectedValue(new Error("Database error"));

    const request = new NextRequest("http://localhost/api/public/analytics-config");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      api_key_public: null,
      environment: "production",
      enabled_client_portal: false,
      enabled_provider_portal: false,
      enabled_admin_portal: false,
      guides_enabled: false,
      surveys_enabled: false,
      sampling_rate: 1.0,
      debug_mode: false,
    });
  });

  it("should not return server keys", async () => {
    const mockConfig = {
      api_key_public: "test-key",
      api_key_server: "secret-key-should-not-be-returned",
      environment: "production",
      enabled_client_portal: true,
      enabled_provider_portal: true,
      enabled_admin_portal: true,
      guides_enabled: false,
      surveys_enabled: false,
      sampling_rate: 1.0,
      debug_mode: false,
    };

    mockSupabase.maybeSingle.mockResolvedValue({
      data: mockConfig,
      error: null,
    });

    const request = new NextRequest("http://localhost/api/public/analytics-config");
    const response = await GET(request);
    const data = await response.json();

    expect(data.api_key_server).toBeUndefined();
    expect(data.api_key_public).toBe("test-key");
  });
});
