import { NextRequest } from "next/server";
import {
  handleApiError,
  requireAuthInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { generateDeviceKeyPlain } from "@/lib/auth/auth-security-db";
import { readDeviceKeyFromRequest } from "@/lib/auth/trust-device";

/**
 * Issues an opaque device key (header for apps, httpOnly cookie for web). Issuing a key grants
 * no trust; a device only becomes trusted through /api/auth/device/verify or a challenge.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuthInApi(request);
    const existing = await readDeviceKeyFromRequest(request);
    const plain = existing && existing.length >= 32 ? existing : generateDeviceKeyPlain();

    const response = successResponse({ device_key: plain });
    response.cookies.set("bn_device", plain, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
    });
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
