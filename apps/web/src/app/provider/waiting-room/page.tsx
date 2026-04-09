"use client";

import React from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { VirtualWaitingRoom } from "@/components/provider-portal/VirtualWaitingRoom";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";

export default function WaitingRoomPage() {
  const { selectedLocationId } = useProviderPortal();
  return (
    <div>
      <PageHeader
        title="Virtual Waiting Room"
        subtitle="Monitor clients who have checked in and manage their service status"
      />
      <VirtualWaitingRoom locationId={selectedLocationId ?? undefined} />
    </div>
  );
}
