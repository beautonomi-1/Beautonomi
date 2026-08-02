"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import LoadingTimeout from "@/components/ui/loading-timeout";

/** Mobile `team-pay` hub parity: owners → payroll; staff → my earnings. */
export default function TeamPayHubPage() {
  const router = useRouter();
  const { isOwner, isLoading } = usePermissions();

  useEffect(() => {
    if (isLoading) return;
    router.replace(isOwner ? "/provider/team/payroll" : "/provider/team/my-earnings");
  }, [isOwner, isLoading, router]);

  return <LoadingTimeout loadingMessage="Opening team & pay…" />;
}
