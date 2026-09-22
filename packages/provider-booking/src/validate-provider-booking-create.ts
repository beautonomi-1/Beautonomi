/** Detailed provider single-booking create validation (mobile + web parity). */

export type ProviderBookingCreateClientMode = "search" | "new";

export type ProviderBookingCreateValidationField =
  | "client"
  | "services"
  | "schedule"
  | "staff"
  | "location"
  | "intake"
  | "recurring";

export type ProviderBookingCreateValidationError = {
  message: string;
  messageKey?: string;
  field: ProviderBookingCreateValidationField;
  sectionKey: ProviderBookingCreateValidationField;
};

export type ProviderIntakeFormField = {
  id: string;
  name: string;
  field_type: string;
  is_required: boolean;
};

export type ProviderIntakeForm = {
  id: string;
  title: string;
  fields?: ProviderIntakeFormField[];
};

export type ProviderBookingCreateValidationInput = {
  clientMode: ProviderBookingCreateClientMode;
  hasSelectedClient: boolean;
  newClientFirstName: string;
  isWalkIn: boolean;
  /** Return null when valid, or error string */
  validatePhone: (phone: string) => string | null;
  newClientPhone: string;
  serviceCount: number;
  productCount: number;
  hasDate: boolean;
  hasTime: boolean;
  isRecurring: boolean;
  recurringHasSavedClient: boolean;
  recurringOccurrences: string;
  staffListLength: number;
  /** Each selected service line must have staff when staffListLength > 0 */
  allServicesHaveStaff: boolean;
  intakeForms: ProviderIntakeForm[];
  intakeResponses: Record<string, Record<string, string | number | boolean | null | undefined>>;
  locationType: "at_salon" | "at_home" | "walk_in";
  addressLine1: string;
  addressLatitude: number | null;
  addressLongitude: number | null;
};

export function collectProviderBookingCreateValidationErrors(
  input: ProviderBookingCreateValidationInput,
): ProviderBookingCreateValidationError[] {
  const errors: ProviderBookingCreateValidationError[] = [];
  const push = (
    message: string,
    field: ProviderBookingCreateValidationField,
    messageKey?: string,
  ) => {
    errors.push({ message, messageKey, field, sectionKey: field });
  };

  if (input.clientMode === "search" && !input.hasSelectedClient) {
    push("Select a client", "client", "selectClient");
  }
  if (input.clientMode === "new" && !input.newClientFirstName.trim()) {
    push("Enter first name", "client", "enterFirstName");
  }
  if (input.clientMode === "new" && !input.isWalkIn) {
    const phoneErr = input.validatePhone(input.newClientPhone);
    if (phoneErr) {
      push(phoneErr, "client");
    }
  }

  if (input.serviceCount <= 0 && input.productCount <= 0) {
    push("Select a service or product", "services", "selectServiceOrProduct");
  }

  if (!input.hasDate) {
    push("Select a date", "schedule", "selectDate");
  }
  if (!input.hasTime) {
    push("Select a time", "schedule", "selectTime");
  }

  if (input.isRecurring) {
    if (!input.recurringHasSavedClient) {
      push("Recurring bookings need a saved client", "recurring", "recurringNeedsSavedClient");
    }
    if (input.serviceCount <= 0) {
      push("Recurring bookings need a service", "recurring", "recurringNeedsService");
    }
    const occ = input.recurringOccurrences.trim();
    if (occ && (!/^\d+$/.test(occ) || Number(occ) < 2)) {
      push("Repeat count must be at least 2", "recurring", "repeatCountMin");
    }
  }

  if (input.staffListLength > 0 && input.serviceCount > 0 && !input.allServicesHaveStaff) {
    push("Assign staff to each service", "staff", "assignStaffEach");
  }

  for (const form of input.intakeForms) {
    for (const field of form.fields ?? []) {
      if (!field.is_required) continue;
      const val = input.intakeResponses[form.id]?.[field.id];
      if (field.field_type === "checkbox") {
        if (val !== true) {
          push(`Complete ${field.name} (${form.title})`, "intake", "completeField");
        }
        continue;
      }
      if (val === undefined || val === null || String(val).trim() === "") {
        push(`Complete ${field.name} (${form.title})`, "intake", "completeField");
      }
    }
  }

  if (input.locationType === "at_home") {
    if (!input.addressLine1.trim()) {
      push("Select client address", "location", "selectClientAddress");
    } else if (input.addressLatitude == null || input.addressLongitude == null) {
      push("Choose an address suggestion or map pin", "location", "chooseAddressSuggestion");
    }
  }

  return errors;
}

export function validateProviderBookingCreateDetailed(
  input: ProviderBookingCreateValidationInput,
): ProviderBookingCreateValidationError | null {
  const errors = collectProviderBookingCreateValidationErrors(input);
  return errors[0] ?? null;
}

/** Map web legacy create input into detailed validation (staff via single id). */
export function mapLegacyValidateCreateBookingInput(input: {
  clientName: string;
  staffId: string;
  date: string;
  startTime: string;
  serviceCount: number;
  productCount?: number;
  intakeValid?: boolean;
  appointmentKind?: "in_salon" | "walk_in" | "at_home";
  atHomeAddressReady?: boolean;
  staffListLength?: number;
  allServicesHaveStaff?: boolean;
  isRecurring?: boolean;
  recurringHasSavedClient?: boolean;
  recurringOccurrences?: string;
}): ProviderBookingCreateValidationInput {
  const kind = input.appointmentKind ?? "in_salon";
  const locationType =
    kind === "at_home" ? "at_home" : kind === "walk_in" ? "walk_in" : "at_salon";

  return {
    clientMode: "new",
    hasSelectedClient: false,
    newClientFirstName: input.clientName.trim(),
    isWalkIn: kind === "walk_in",
    validatePhone: () => null,
    newClientPhone: "",
    serviceCount: input.serviceCount,
    productCount: input.productCount ?? 0,
    hasDate: Boolean(input.date?.trim()),
    hasTime: Boolean(input.startTime?.trim()),
    isRecurring: input.isRecurring ?? false,
    recurringHasSavedClient: input.recurringHasSavedClient ?? true,
    recurringOccurrences: input.recurringOccurrences ?? "",
    staffListLength: input.staffListLength ?? 1,
    allServicesHaveStaff:
      input.allServicesHaveStaff ?? Boolean(input.staffId?.trim()),
    intakeForms: [],
    intakeResponses: {},
    locationType,
    addressLine1: input.atHomeAddressReady === false ? "" : "ok",
    addressLatitude: input.atHomeAddressReady === false ? null : 0,
    addressLongitude: input.atHomeAddressReady === false ? null : 0,
  };
}
