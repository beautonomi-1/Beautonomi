import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, requireRoleInApi, successResponse } from "@/lib/supabase/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const { error } = await supabase
      .from("users")
      .update({ password_changed_at: new Date().toISOString() })
      .eq("id", user.id);

    if (error) {
      throw error;
    }

    const { revokeTrustedDevicesExcept } = await import("@/lib/auth/auth-security-db");
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const { readDeviceKeyFromRequest } = await import("@/lib/auth/trust-device");
    const { hashDeviceKey } = await import("@/lib/auth/auth-security-db");
    const currentKey = await readDeviceKeyFromRequest(request);
    await revokeTrustedDevicesExcept(
      getSupabaseAdmin(),
      user.id,
      currentKey ? hashDeviceKey(currentKey) : null,
    );

    const { sendSecurityAlert } = await import("@/lib/notifications/security-notifications");
    const isProvider = user.role === "provider_owner" || user.role === "provider_staff";
    await sendSecurityAlert({
      key: "security_password_changed",
      userId: user.id,
      appType: isProvider ? "provider" : "customer",
      eventId: `password_changed:${user.id}:${Math.floor(Date.now() / 60_000)}`,
    });

    return successResponse({ message: "Password timestamp updated" });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not authenticated")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return handleApiError(error, "Failed to update password timestamp");
  }
}
