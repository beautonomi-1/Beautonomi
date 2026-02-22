"use client";

import React from "react";

interface AppointmentDetailsModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  appointment?: any;
  onEdit?: () => void;
  onDelete?: () => void;
  onStatusChange?: (status: string) => void;
  onCreateGroupBooking?: () => void;
}

function AppointmentDetailsModal(_props: AppointmentDetailsModalProps) {
  // This component has been replaced by AppointmentSidebar
  // Kept as stub for Turbopack module resolution
  return <></>;
}

export default AppointmentDetailsModal;
export { AppointmentDetailsModal };
