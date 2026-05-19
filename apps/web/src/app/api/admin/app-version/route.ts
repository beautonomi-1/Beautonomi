import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { z } from "zod";

const APP_KEYS = ["customer", "provider"] as const;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

const platformSchema = z.object({
  min_version: z.string().trim().regex(SEMVER_PATTERN, "Use semantic version format, for example 1.2.3"),
  latest_version: z.string().trim().regex(SEMVER_PATTERN, "Use semantic version format, for example 1.2.3"),
  force_update: z.boolean().optional(),
  update_url: z.string().url(),
}).superRefine((value, ctx) => {
  if (compareVersions(value.latest_version, value.min_version) < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["latest_version"],
      message: "Latest version must be the same as or newer than minimum version",
    });
  }
});

const appPairSchema = z.object({
  ios: platformSchema,
  android: platformSchema,
});

const fullBodySchema = z.object({
  customer: appPairSchema,
  provider: appPairSchema,
});

type PlatformVersion = z.infer<typeof platformSchema>;
type AppPair = z.infer<typeof appPairSchema>;
type FullPayload = z.infer<typeof fullBodySchema>;

type AppVersionSettingRow = {
  app?: string;
  platform?: string;
  min_version?: string;
  latest_version?: string;
  force_update?: boolean;
  update_url?: string;
};

const DEFAULT_IOS: PlatformVersion = {
  min_version: "1.0.0",
  latest_version: "1.0.0",
  force_update: false,
  update_url: "https://apps.apple.com/app/beautonomi",
};

const DEFAULT_ANDROID: PlatformVersion = {
  min_version: "1.0.0",
  latest_version: "1.0.0",
  force_update: false,
  update_url: "https://play.google.com/store/apps/details?id=com.beautonomi",
};

const DEFAULT_PROVIDER_ANDROID: PlatformVersion = {
  ...DEFAULT_ANDROID,
  update_url: "https://play.google.com/store/apps/details?id=com.beautonomi.partner",
};

function defaultAppPair(): AppPair {
  return {
    ios: { ...DEFAULT_IOS },
    android: { ...DEFAULT_ANDROID },
  };
}

function defaultFullPayload(): FullPayload {
  const out = {
    customer: defaultAppPair(),
    provider: defaultAppPair(),
  };
  out.provider.android = { ...DEFAULT_PROVIDER_ANDROID };
  return out;
}

function compareVersions(a: string, b: string): number {
  const parse = (value: string) =>
    value
      .trim()
      .split(/[+-]/)[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));
  const aParts = parse(a);
  const bParts = parse(b);
  const maxLength = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLength; i += 1) {
    const aVal = aParts[i] ?? 0;
    const bVal = bParts[i] ?? 0;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }
  return 0;
}

function rowToPlatformVersion(row: AppVersionSettingRow | undefined, fallback: PlatformVersion): PlatformVersion {
  return {
    min_version: row?.min_version ?? fallback.min_version,
    latest_version: row?.latest_version ?? fallback.latest_version,
    force_update: row?.force_update ?? false,
    update_url: row?.update_url ?? fallback.update_url,
  };
}

function payloadFromRows(rows: AppVersionSettingRow[]): FullPayload {
  const out = defaultFullPayload();
  for (const app of APP_KEYS) {
    const subset = rows.filter((r) => String(r.app) === app);
    const iosRow = subset.find((s) => s.platform === "ios");
    const androidRow = subset.find((s) => s.platform === "android");
    out[app] = {
      ios: rowToPlatformVersion(iosRow, DEFAULT_IOS),
      android: rowToPlatformVersion(androidRow, DEFAULT_ANDROID),
    };
  }
  return out;
}

/**
 * GET /api/admin/app-version
 *
 * Returns { customer: { ios, android }, provider: { ios, android } }.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const supabase = getSupabaseAdmin();

    const { data: versionSettings, error } = await supabase.from("app_version_settings").select("*");

    if (error) {
      return successResponse(defaultFullPayload());
    }

    const settings = (versionSettings ?? []) as AppVersionSettingRow[];
    return successResponse(payloadFromRows(settings));
  } catch (error) {
    return handleApiError(error, "Failed to fetch app version settings");
  }
}

/**
 * PATCH /api/admin/app-version
 *
 * Body: { customer: { ios, android }, provider: { ios, android } }.
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const supabase = getSupabaseAdmin();
    const body = await request.json();

    const parsed = fullBodySchema.parse(body);
    const now = new Date().toISOString();

    const rows = [
      {
        app: "customer" as const,
        platform: "ios" as const,
        min_version: parsed.customer.ios.min_version,
        latest_version: parsed.customer.ios.latest_version,
        force_update: parsed.customer.ios.force_update ?? false,
        update_url: parsed.customer.ios.update_url,
        updated_at: now,
      },
      {
        app: "customer" as const,
        platform: "android" as const,
        min_version: parsed.customer.android.min_version,
        latest_version: parsed.customer.android.latest_version,
        force_update: parsed.customer.android.force_update ?? false,
        update_url: parsed.customer.android.update_url,
        updated_at: now,
      },
      {
        app: "provider" as const,
        platform: "ios" as const,
        min_version: parsed.provider.ios.min_version,
        latest_version: parsed.provider.ios.latest_version,
        force_update: parsed.provider.ios.force_update ?? false,
        update_url: parsed.provider.ios.update_url,
        updated_at: now,
      },
      {
        app: "provider" as const,
        platform: "android" as const,
        min_version: parsed.provider.android.min_version,
        latest_version: parsed.provider.android.latest_version,
        force_update: parsed.provider.android.force_update ?? false,
        update_url: parsed.provider.android.update_url,
        updated_at: now,
      },
    ];

    const { error: upsertError } = await supabase.from("app_version_settings").upsert(rows, {
      onConflict: "app,platform",
    });

    if (upsertError) {
      throw upsertError;
    }

    const { data: updatedSettings } = await supabase.from("app_version_settings").select("*");
    return successResponse(payloadFromRows((updatedSettings ?? []) as AppVersionSettingRow[]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e) => e.message).join(", ")),
        "Validation failed",
        400
      );
    }
    return handleApiError(error, "Failed to update app version settings");
  }
}

export { defaultFullPayload, type FullPayload, APP_KEYS };
