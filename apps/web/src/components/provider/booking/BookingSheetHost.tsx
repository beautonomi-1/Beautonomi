"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import type { AppointmentSidebarProps } from "@/components/appointments/types";
import { useAppointmentSidebar, switchToViewModeWithRefund, openCreateMode } from "@/stores/appointment-sidebar-store";
import { BookingSheetHostErrorBoundary } from "./BookingSheetHostErrorBoundary";

const AppointmentCreateFlow = dynamic(
  () =>
    import("./create/AppointmentCreateFlow").then((m) => ({
      default: m.AppointmentCreateFlow,
    })),
  { ssr: false },
);

const AppointmentViewSheet = dynamic(
  () =>
    import("./view/AppointmentViewSheet").then((m) => ({
      default: m.AppointmentViewSheet,
    })),
  { ssr: false },
);

const AppointmentEditSheet = dynamic(
  () =>
    import("./edit/AppointmentEditSheet").then((m) => ({
      default: m.AppointmentEditSheet,
    })),
  { ssr: false },
);

const CreatedSuccessSheet = dynamic(
  () =>
    import("./create/CreatedSuccessSheet").then((m) => ({
      default: m.CreatedSuccessSheet,
    })),
  { ssr: false },
);

export function BookingSheetHost(props: AppointmentSidebarProps) {
  const { mode, isOpen } = useAppointmentSidebar();

  useEffect(() => {
    const handleOpenSidebar = () => {
      const today = new Date().toISOString().split("T")[0];
      openCreateMode({
        staffId: "",
        date: today,
        startTime: new Date().toTimeString().slice(0, 5),
      });
    };
    window.addEventListener("open-appointment-sidebar", handleOpenSidebar);
    return () => window.removeEventListener("open-appointment-sidebar", handleOpenSidebar);
  }, []);

  return (
    <BookingSheetHostErrorBoundary>
      {mode === "create" ? (
        <AppointmentCreateFlow
          teamMembers={props.teamMembers ?? []}
          services={props.services}
          locations={props.locations ?? []}
          onSuccess={props.onAppointmentCreated}
          onRefresh={props.onRefresh}
        />
      ) : null}

      {mode === "view" && isOpen ? (
        <AppointmentViewSheet onRefresh={props.onRefresh} />
      ) : null}

      {mode === "edit" && isOpen ? (
        <AppointmentEditSheet
          services={props.services}
          teamMembers={props.teamMembers ?? []}
          onSuccess={props.onAppointmentUpdated}
          onRefresh={props.onRefresh}
          onRequestRefund={switchToViewModeWithRefund}
        />
      ) : null}

      {mode === "success" ? <CreatedSuccessSheet /> : null}
    </BookingSheetHostErrorBoundary>
  );
}
