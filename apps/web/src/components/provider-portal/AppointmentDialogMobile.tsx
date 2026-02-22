"use client";

import React from "react";

interface AppointmentDialogMobileProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  appointment?: any;
  defaultDate?: Date;
  defaultTime?: string;
  defaultTeamMemberId?: string;
  onSuccess?: () => void;
  onCheckout?: (appointment: any) => void;
}

function AppointmentDialogMobile(_props: AppointmentDialogMobileProps) {
  // This component has been replaced by AppointmentSidebar
  // Kept as stub for Turbopack module resolution
  return <></>;
}

export default AppointmentDialogMobile;
export { AppointmentDialogMobile };
