import type { ProviderBookingCreateValidationInput } from "@beautonomi/provider-booking";

type Args = {
  clientMode: "search" | "new";
  selectedClient: { customer_id?: string } | null;
  newClientFirst: string;
  isWalkIn: boolean;
  newClientPhoneE164: string;
  validatePhone: (phone: string) => string | null;
  selectedServicesLength: number;
  selectedProductsLength: number;
  selectedDate: Date | null;
  selectedTime: string;
  isRecurring: boolean;
  recurrenceOccurrences: string;
  staffListLength: number;
  selectedServices: { staffId?: string }[];
  activeProviderForms: ProviderBookingCreateValidationInput["intakeForms"];
  providerFormResponses: ProviderBookingCreateValidationInput["intakeResponses"];
  locationType: "at_salon" | "at_home";
  addressLine1: string;
  addressLatitude: number | null;
  addressLongitude: number | null;
};

export function buildNewBookingValidationInput(args: Args): ProviderBookingCreateValidationInput {
  const loc =
    args.isWalkIn ? "walk_in" : args.locationType === "at_home" ? "at_home" : "at_salon";

  return {
    clientMode: args.clientMode,
    hasSelectedClient: Boolean(args.selectedClient),
    newClientFirstName: args.newClientFirst,
    isWalkIn: args.isWalkIn,
    validatePhone: args.validatePhone,
    newClientPhone: args.newClientPhoneE164,
    serviceCount: args.selectedServicesLength,
    productCount: args.selectedProductsLength,
    hasDate: args.selectedDate != null,
    hasTime: Boolean(args.selectedTime?.trim()),
    isRecurring: args.isRecurring,
    recurringHasSavedClient: Boolean(args.selectedClient?.customer_id),
    recurringOccurrences: args.recurrenceOccurrences,
    staffListLength: args.staffListLength,
    allServicesHaveStaff:
      args.staffListLength === 0 ||
      args.selectedServicesLength === 0 ||
      !args.selectedServices.some((s) => !s.staffId),
    intakeForms: args.activeProviderForms,
    intakeResponses: args.providerFormResponses,
    locationType: loc,
    addressLine1: args.addressLine1,
    addressLatitude: args.addressLatitude,
    addressLongitude: args.addressLongitude,
  };
}
