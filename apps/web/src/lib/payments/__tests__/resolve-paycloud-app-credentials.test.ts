import { describe, expect, it, vi } from "vitest";
import { resolvePaycloudAppCredentials } from "../resolve-paycloud-app-credentials";

function makeSupabase(responses: Record<string, unknown>) {
  const chain = (table: string) => ({
    select: () => chain(table),
    eq: () => chain(table),
    is: () => chain(table),
    maybeSingle: async () => ({ data: responses[table] ?? null, error: null }),
  });
  return { from: (table: string) => chain(table) } as never;
}

describe("resolvePaycloudAppCredentials", () => {
  it("falls back to tenant app when merchant has no linked app", async () => {
    const supabase = makeSupabase({
      tenant_paycloud_apps: {
        app_id: "tenant-app",
        app_rsa_private_key: "priv",
        gateway_rsa_public_key: "pub",
        is_enabled: true,
      },
    });
    const creds = await resolvePaycloudAppCredentials(supabase, {
      environment: "sandbox",
      tenantId: "tenant-1",
      paycloudAppId: null,
    });
    expect(creds?.app_id).toBe("tenant-app");
  });

  it("falls back to global app when tenant row missing", async () => {
    const supabase = {
      from: () => {
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.is = () => builder;
        builder.maybeSingle = async () => ({
          data: {
            app_id: "global-app",
            app_rsa_private_key: "priv",
            gateway_rsa_public_key: "pub",
            is_enabled: true,
          },
          error: null,
        });
        return builder;
      },
    } as never;

    const creds = await resolvePaycloudAppCredentials(supabase, {
      environment: "live",
      tenantId: "tenant-1",
    });
    expect(creds?.app_id).toBe("global-app");
  });

  it("skips linked app when env mismatches and falls through to tenant", async () => {
    let call = 0;
    const supabase = {
      from: () => {
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.is = () => builder;
        builder.maybeSingle = async () => {
          call += 1;
          // First call: linked app (sandbox) while merchant env is live
          if (call === 1) {
            return {
              data: {
                app_id: "linked-sandbox",
                app_rsa_private_key: "priv",
                gateway_rsa_public_key: "pub",
                is_enabled: true,
                environment: "sandbox",
              },
              error: null,
            };
          }
          // Second call: tenant live app
          return {
            data: {
              app_id: "tenant-live",
              app_rsa_private_key: "priv",
              gateway_rsa_public_key: "pub",
              is_enabled: true,
            },
            error: null,
          };
        };
        return builder;
      },
    } as never;

    const creds = await resolvePaycloudAppCredentials(supabase, {
      environment: "live",
      tenantId: "tenant-1",
      paycloudAppId: "app-sandbox-id",
    });
    expect(creds?.app_id).toBe("tenant-live");
  });
});

describe("validatePaycloudAppMatchesMerchantEnv", () => {
  it("rejects app env mismatch", async () => {
    const { validatePaycloudAppMatchesMerchantEnv } = await import("../paycloud-merchant-helpers");
    const supabase = makeSupabase({
      tenant_paycloud_apps: { environment: "sandbox" },
    });
    const result = await validatePaycloudAppMatchesMerchantEnv(supabase, "app-1", "live");
    expect(result.ok).toBe(false);
  });
});
