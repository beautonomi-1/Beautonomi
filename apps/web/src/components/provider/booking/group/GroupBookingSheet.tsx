"use client";

import { GroupBookingDialog } from "@/components/provider-portal/GroupBookingDialog";
import type { GroupBooking, Appointment } from "@/lib/provider-portal/types";
import { useGroupBookingPaymentRealtime } from "../hooks/useGroupBookingPaymentRealtime";
import { GroupBookingViewSheet } from "./GroupBookingViewSheet";
import { openGroupEditMode } from "@/stores/appointment-sidebar-store";
import type { GroupSheetMode } from "@/stores/appointment-sidebar-store";

interface GroupBookingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: GroupSheetMode;
  groupId?: string | null;
  booking?: GroupBooking | null;
  onSuccess?: () => void;
  defaultDate?: Date;
  defaultTime?: string;
  defaultTeamMemberId?: string;
  existingAppointments?: Appointment[];
  providerId?: string;
}

/** Native group booking shell: view sheet + create/edit bottom sheet. */
export function GroupBookingSheet({
  open,
  onOpenChange,
  mode = "create",
  groupId,
  booking,
  onSuccess,
  ...dialogProps
}: GroupBookingSheetProps) {
  const activeGroupId = groupId ?? booking?.id ?? null;

  useGroupBookingPaymentRealtime(activeGroupId, open && mode === "view" && !!activeGroupId, () => {
    onSuccess?.();
  });

  if (!open) return null;

  if (mode === "view") {
    return (
      <GroupBookingViewSheet
        open={open}
        groupId={groupId ?? booking?.id ?? null}
        onOpenChange={onOpenChange}
        onEdit={(group) => {
          openGroupEditMode(group);
        }}
        onRefresh={onSuccess}
      />
    );
  }

  return (
    <GroupBookingDialog
      open={open}
      onOpenChange={onOpenChange}
      booking={mode === "edit" ? booking : null}
      onSuccess={onSuccess}
      presentation="sheet"
      {...dialogProps}
    />
  );
}
