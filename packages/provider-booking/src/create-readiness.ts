import { collectGroupBookingCreateValidationErrors } from "./collect-group-booking-create-errors";
import type { GroupBookingCreateValidationField, GroupBookingCreateValidationInput } from "./validateGroupBookingCreate";
import {
  collectProviderBookingCreateValidationErrors,
  type ProviderBookingCreateValidationField,
  type ProviderBookingCreateValidationInput,
} from "./validate-provider-booking-create";

export type CreateReadinessItemId =
  | "group_date"
  | "group_time"
  | "group_duration"
  | "group_service"
  | "group_staff"
  | "group_address"
  | "group_participants"
  | `group_participant_${number}`
  | "booking_client"
  | "booking_services"
  | "booking_schedule"
  | "booking_staff"
  | "booking_location"
  | "booking_intake"
  | "booking_recurring";

export type CreateReadinessItem = {
  id: CreateReadinessItemId;
  field?: GroupBookingCreateValidationField | ProviderBookingCreateValidationField;
  done: boolean;
  required: boolean;
  sectionKey: string;
};

export type CreateReadinessSummary = {
  items: CreateReadinessItem[];
  completed: number;
  total: number;
  percent: number;
  nextItem?: CreateReadinessItem;
};

function summarize(items: CreateReadinessItem[]): CreateReadinessSummary {
  const required = items.filter((i) => i.required);
  const completed = required.filter((i) => i.done).length;
  const total = required.length;
  const percent = total === 0 ? 100 : Math.round((completed / total) * 100);
  const nextItem = required.find((i) => !i.done);
  return { items, completed, total, percent, nextItem };
}

export function buildGroupBookingCreateReadiness(
  input: GroupBookingCreateValidationInput,
): CreateReadinessSummary {
  const errors = collectGroupBookingCreateValidationErrors(input);
  const errorFields = new Set(errors.map((e) => e.field));

  const participants = input.participants.filter(
    (p) => p.name.length > 0 || p.phone.length > 0 || p.email.length > 0,
  );

  const items: CreateReadinessItem[] = [
    {
      id: "group_date",
      field: "date",
      done: !errorFields.has("date"),
      required: true,
      sectionKey: "date",
    },
    {
      id: "group_time",
      field: "time",
      done: !errorFields.has("time"),
      required: true,
      sectionKey: "time",
    },
    {
      id: "group_duration",
      field: "duration",
      done: !errorFields.has("duration"),
      required: true,
      sectionKey: "duration",
    },
    {
      id: "group_service",
      field: "serviceId",
      done: !errorFields.has("serviceId"),
      required: true,
      sectionKey: "serviceId",
    },
    {
      id: "group_staff",
      field: "staffId",
      done: !errorFields.has("staffId"),
      required: true,
      sectionKey: "staffId",
    },
  ];

  if (input.locationType === "at_home") {
    items.push({
      id: "group_address",
      field: "address",
      done: !errorFields.has("address"),
      required: true,
      sectionKey: "address",
    });
  }

  if (participants.length === 0) {
    items.push({
      id: "group_participants",
      field: "participants",
      done: false,
      required: true,
      sectionKey: "participants",
    });
  } else {
    for (let idx = 0; idx < participants.length; idx++) {
      const field = `participant:${idx}` as GroupBookingCreateValidationField;
      items.push({
        id: `group_participant_${idx}`,
        field,
        done: !errorFields.has(field),
        required: true,
        sectionKey: "participants",
      });
    }
  }

  return summarize(items);
}

export function buildSingleBookingCreateReadiness(
  input: ProviderBookingCreateValidationInput,
): CreateReadinessSummary {
  const errors = collectProviderBookingCreateValidationErrors(input);
  const errorSections = new Set(errors.map((e) => e.sectionKey));

  const sectionDone = (key: ProviderBookingCreateValidationField, required: boolean) =>
    !required || !errorSections.has(key);

  const needsStaff =
    input.staffListLength > 0 && input.serviceCount > 0;
  const needsLocation = input.locationType === "at_home";
  const needsRecurring = input.isRecurring;
  const needsIntake = input.intakeForms.some((f) =>
    (f.fields ?? []).some((field) => field.is_required),
  );

  const items: CreateReadinessItem[] = [
    {
      id: "booking_client",
      field: "client",
      done: sectionDone("client", true),
      required: true,
      sectionKey: "client",
    },
    {
      id: "booking_services",
      field: "services",
      done: sectionDone("services", true),
      required: true,
      sectionKey: "services",
    },
    {
      id: "booking_schedule",
      field: "schedule",
      done: sectionDone("schedule", true),
      required: true,
      sectionKey: "schedule",
    },
  ];

  if (needsStaff) {
    items.push({
      id: "booking_staff",
      field: "staff",
      done: sectionDone("staff", true),
      required: true,
      sectionKey: "staff",
    });
  }

  if (needsLocation) {
    items.push({
      id: "booking_location",
      field: "location",
      done: sectionDone("location", true),
      required: true,
      sectionKey: "location",
    });
  }

  if (needsIntake) {
    items.push({
      id: "booking_intake",
      field: "intake",
      done: sectionDone("intake", true),
      required: true,
      sectionKey: "intake",
    });
  }

  if (needsRecurring) {
    items.push({
      id: "booking_recurring",
      field: "recurring",
      done: sectionDone("recurring", true),
      required: true,
      sectionKey: "recurring",
    });
  }

  return summarize(items);
}

export { collectGroupBookingCreateValidationErrors } from "./collect-group-booking-create-errors";
