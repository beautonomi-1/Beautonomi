import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/public/ip-geolocation
 * 
 * Get user's location based on their IP address
 * Returns country, city, postal code, and approximate coordinates
 */
/**
 * Check if IP is in a reserved/private range
 */
function isReservedIP(ip: string): boolean {
  // Check for localhost, private ranges, etc.
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") {
    return true;
  }
  
  // Check for private IP ranges
  const privateRanges = [
    /^10\./,           // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./,    // 192.168.0.0/16
    /^169\.254\./,    // Link-local
    /^fc00:/,         // IPv6 private
    /^fe80:/,         // IPv6 link-local
  ];
  
  return privateRanges.some(range => range.test(ip));
}

export async function GET(request: NextRequest) {
  try {
    // Get client IP address from headers
    const forwarded = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const ip = forwarded?.split(",")[0]?.trim() || realIp || "";

    if (!ip) {
      return NextResponse.json({ data: null, error: null });
    }

    // For localhost/private IPs, return 200 with null data (avoids 400 in dev console)
    if (isReservedIP(ip)) {
      return NextResponse.json({
        data: null,
        error: null,
      });
    }

    // Use ipapi.co for IP geolocation (free tier: 1000 requests/day)
    // Alternative: ip-api.com (free tier: 45 requests/minute)
    try {
      const response = await fetch(`https://ipapi.co/${ip}/json/`, {
        headers: {
          "User-Agent": "Beautonomi/1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`IP geolocation service returned ${response.status}`);
      }

      const data = await response.json();

      // Check for error in response
      if (data.error) {
        // Fallback to ip-api.com if ipapi.co fails
        return await getLocationFromIpApi(ip);
      }

      // Extract relevant location data
      const locationData = {
        country: data.country_name || data.country || null,
        countryCode: data.country_code || null,
        city: data.city || null,
        postalCode: data.postal || data.postal_code || null,
        region: data.region || data.region_name || null,
        latitude: data.latitude || null,
        longitude: data.longitude || null,
        timezone: data.timezone || null,
        ip: data.ip || ip,
      };

      return NextResponse.json({
        data: locationData,
        error: null,
      });
    } catch (ipapiError) {
      // Fallback to ip-api.com
      console.warn("ipapi.co failed, trying ip-api.com:", ipapiError);
      return await getLocationFromIpApi(ip);
    }
  } catch (error: any) {
    console.error("Error in IP geolocation:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to get location from IP",
          code: "GEOLOCATION_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Fallback function to get location from ip-api.com
 */
async function getLocationFromIpApi(ip: string) {
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,city,zip,lat,lon,regionName,timezone,query`, {
      headers: {
        "User-Agent": "Beautonomi/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`IP geolocation service returned ${response.status}`);
    }

    const data = await response.json();

    if (data.status === "fail") {
      throw new Error(data.message || "Failed to get location");
    }

    const locationData = {
      country: data.country || null,
      countryCode: data.countryCode || null,
      city: data.city || null,
      postalCode: data.zip || null,
      region: data.regionName || null,
      latitude: data.lat || null,
      longitude: data.lon || null,
      timezone: data.timezone || null,
      ip: data.query || ip,
    };

    return NextResponse.json({
      data: locationData,
      error: null,
    });
  } catch (error: any) {
    console.error("Error in ip-api.com fallback:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to get location from IP",
          code: "GEOLOCATION_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
