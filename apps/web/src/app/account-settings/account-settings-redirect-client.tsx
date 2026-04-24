"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";

/**
 * When an authenticated user lands on `/account-settings?redirect=/somewhere`
 * (e.g. shop flow), send them on without blocking on the hub.
 */
export default function AccountSettingsRedirectClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || !user) return;
    const target = searchParams.get("redirect");
    if (!target || !target.startsWith("/")) return;
    router.replace(target);
  }, [isLoading, user, searchParams, router]);

  return null;
}
