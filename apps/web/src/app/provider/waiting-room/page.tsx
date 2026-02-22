"use client";

import React from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { VirtualWaitingRoom } from "@/components/provider-portal/VirtualWaitingRoom";

export default function WaitingRoomPage() {
  return (
    <div>
      <PageHeader
        title="Virtual Waiting Room"
        subtitle="Monitor clients who have checked in and manage their service status"
      />
      <VirtualWaitingRoom />
    </div>
  );
}
