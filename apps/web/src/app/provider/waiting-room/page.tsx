"use client";

import { useTranslation } from "@beautonomi/i18n";
import React from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { VirtualWaitingRoom } from "@/components/provider-portal/VirtualWaitingRoom";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";

export default function WaitingRoomPage() {
  const { t } = useTranslation();
  const { selectedLocationId } = useProviderPortal();
  return (
    <div>
      <PageHeader
title={t("web.provider.portal.waitingRoom.pageTitle")}
subtitle={t("web.provider.portal.waitingRoom.pageSubtitle")}
      />
      <VirtualWaitingRoom locationId={selectedLocationId ?? undefined} />
    </div>
  );
}
