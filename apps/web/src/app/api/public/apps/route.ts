import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";

/**
 * GET /api/public/apps
 * 
 * Public endpoint to get app information for customer and provider apps
 * This is cached and doesn't require authentication
 */
export const GET = unstable_cache(
  async (request: Request) => {
    try {
      const { searchParams } = new URL(request.url);
      const appType = searchParams.get("type") || "customer"; // customer or provider
      const platform = searchParams.get("platform"); // android, ios, huawei

      let appsSettings: any = null;
      
      try {
        const supabase = await getSupabaseServer();
        const { data: settings, error: settingsError } = await (supabase
          .from("platform_settings") as any)
          .select("settings")
          .single();

        if (!settingsError && settings && (settings as any).settings) {
          appsSettings = (settings as any).settings.apps;
        }
      } catch (dbError) {
        // Silently fall back to defaults if database query fails
        console.warn("Could not fetch app settings from database, using defaults:", dbError);
      }

      if (appsSettings) {
        if (platform) {
          // Return specific platform
          const platformData = appsSettings?.[appType]?.[platform];
          if (platformData && platformData.enabled) {
            return NextResponse.json({
              data: platformData,
              error: null,
            });
          }
          // If platform not found or disabled, return default for that platform
        } else {
          // Return all platforms for the app type
          const appTypeData = appsSettings?.[appType];
          if (appTypeData) {
            return NextResponse.json({
              data: appTypeData,
              error: null,
            });
          }
        }
      }

      // Fallback to default (always return defaults, never error)
      const defaultApps = {
        customer: {
          android: {
            package_name: "com.beautonomi.customer",
            version: "1.0.0",
            min_version: "1.0.0",
            download_url: "https://play.google.com/store/apps/details?id=com.beautonomi.customer",
            enabled: true,
          },
          ios: {
            bundle_id: "com.beautonomi.customer",
            version: "1.0.0",
            min_version: "1.0.0",
            app_store_url: "https://apps.apple.com/app/beautonomi-customer",
            enabled: true,
          },
          huawei: {
            package_name: "com.beautonomi.customer",
            version: "1.0.0",
            min_version: "1.0.0",
            app_gallery_url: "https://appgallery.huawei.com/app/C100000000",
            enabled: false,
          },
        },
        provider: {
          android: {
            package_name: "com.beautonomi.provider",
            version: "1.0.0",
            min_version: "1.0.0",
            download_url: "https://play.google.com/store/apps/details?id=com.beautonomi.provider",
            enabled: true,
          },
          ios: {
            bundle_id: "com.beautonomi.provider",
            version: "1.0.0",
            min_version: "1.0.0",
            app_store_url: "https://apps.apple.com/app/beautonomi-provider",
            enabled: true,
          },
          huawei: {
            package_name: "com.beautonomi.provider",
            version: "1.0.0",
            min_version: "1.0.0",
            app_gallery_url: "https://appgallery.huawei.com/app/C100000001",
            enabled: false,
          },
        },
      };

      // Always return defaults instead of erroring
      const defaultData = platform 
        ? defaultApps[appType as keyof typeof defaultApps]?.[platform as keyof typeof defaultApps.customer] 
        : defaultApps[appType as keyof typeof defaultApps];
      
      return NextResponse.json({
        data: defaultData || defaultApps.customer, // Fallback to customer if appType is invalid
        error: null,
      });
    } catch (error) {
      // Even on unexpected errors, return defaults instead of erroring
      console.warn("Unexpected error in /api/public/apps, returning defaults:", error);
      const { searchParams } = new URL(request.url);
      const appType = searchParams.get("type") || "customer";
      const platform = searchParams.get("platform");
      
      const defaultApps = {
        customer: {
          android: {
            package_name: "com.beautonomi.customer",
            version: "1.0.0",
            min_version: "1.0.0",
            download_url: "https://play.google.com/store/apps/details?id=com.beautonomi.customer",
            enabled: true,
          },
          ios: {
            bundle_id: "com.beautonomi.customer",
            version: "1.0.0",
            min_version: "1.0.0",
            app_store_url: "https://apps.apple.com/app/beautonomi-customer",
            enabled: true,
          },
          huawei: {
            package_name: "com.beautonomi.customer",
            version: "1.0.0",
            min_version: "1.0.0",
            app_gallery_url: "https://appgallery.huawei.com/app/C100000000",
            enabled: false,
          },
        },
        provider: {
          android: {
            package_name: "com.beautonomi.provider",
            version: "1.0.0",
            min_version: "1.0.0",
            download_url: "https://play.google.com/store/apps/details?id=com.beautonomi.provider",
            enabled: true,
          },
          ios: {
            bundle_id: "com.beautonomi.provider",
            version: "1.0.0",
            min_version: "1.0.0",
            app_store_url: "https://apps.apple.com/app/beautonomi-provider",
            enabled: true,
          },
          huawei: {
            package_name: "com.beautonomi.provider",
            version: "1.0.0",
            min_version: "1.0.0",
            app_gallery_url: "https://appgallery.huawei.com/app/C100000001",
            enabled: false,
          },
        },
      };
      
      const defaultData = platform 
        ? defaultApps[appType as keyof typeof defaultApps]?.[platform as keyof typeof defaultApps.customer] 
        : defaultApps[appType as keyof typeof defaultApps];
      
      return NextResponse.json({
        data: defaultData || defaultApps.customer,
        error: null,
      });
    }
  },
  ["apps-public"],
  {
    revalidate: 3600, // Revalidate every hour
    tags: ["platform-settings"],
  }
);
