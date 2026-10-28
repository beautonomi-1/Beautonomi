/** Shared with customer mobile — booking detail status pill labels for account web. */
export type BookingDetailTranslate = (
  key: string,
  opts?: Record<string, string | number>,
) => string;

export function customerStatusPillLabel(
  status: string,
  effectiveStatus: string,
  td: BookingDetailTranslate,
): string {
  switch (status) {
    case "no_show":
      return td("statusNoShow");
    case "in_progress":
    case "started":
      return td("statusServiceInProgress");
    case "checked_in":
      return td("statusCheckedIn");
    case "pending_payment":
      return td("statusPaymentPending");
    case "pending":
      return td("statusAwaitingConfirmation");
    case "confirmed":
      return td("statusPillConfirmed");
    case "completed":
      return td("statusPillCompleted");
    case "cancelled":
      return td("statusPillCancelled");
    case "waiting":
      return td("statusPillWaiting");
    default:
      switch (effectiveStatus) {
        case "pending_payment":
          return td("statusPaymentPending");
        case "pending":
          return td("milestoneRequestReceived");
        case "confirmed":
          return td("milestoneBookingConfirmed");
        case "completed":
          return td("statusServiceCompleted");
        case "cancelled":
          return td("statusBookingCancelled");
        case "no_show":
          return td("statusNoShow");
        case "started":
        case "in_progress":
          return td("statusServiceInProgress");
        default:
          return td("lifecycleUpdateTitle");
      }
  }
}
