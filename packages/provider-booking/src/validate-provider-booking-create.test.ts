import { describe, expect, it } from "vitest";
import {
  collectProviderBookingCreateValidationErrors,
  type ProviderBookingCreateValidationInput,
} from "./validate-provider-booking-create";

const base: ProviderBookingCreateValidationInput = {
  clientMode: "search",
  hasSelectedClient: true,
  newClientFirstName: "",
  isWalkIn: false,
  validatePhone: () => null,
  newClientPhone: "",
  serviceCount: 1,
  productCount: 0,
  hasDate: true,
  hasTime: true,
  isRecurring: false,
  recurringHasSavedClient: true,
  recurringOccurrences: "",
  staffListLength: 0,
  allServicesHaveStaff: true,
  intakeForms: [],
  intakeResponses: {},
  locationType: "at_salon",
  addressLine1: "",
  addressLatitude: null,
  addressLongitude: null,
};

const intakeErrors = (input: Partial<ProviderBookingCreateValidationInput>) =>
  collectProviderBookingCreateValidationErrors({ ...base, ...input }).filter((e) => e.field === "intake");

describe("intake form validation", () => {
  const optionalFieldForm = {
    id: "form-1",
    title: "Consent",
    fields: [
      { id: "f-sign", name: "Signature", field_type: "signature", is_required: false },
      { id: "f-agree", name: "I agree", field_type: "checkbox", is_required: false },
    ],
  };

  it("does not require optional fields on an optional form", () => {
    expect(intakeErrors({ intakeForms: [optionalFieldForm] })).toHaveLength(0);
  });

  it("requires every field when the form itself is required (API parity)", () => {
    const errors = intakeErrors({ intakeForms: [{ ...optionalFieldForm, is_required: true }] });
    expect(errors).toHaveLength(2);
  });

  it("accepts a required form once every field is answered by field id", () => {
    const errors = intakeErrors({
      intakeForms: [{ ...optionalFieldForm, is_required: true }],
      intakeResponses: { "form-1": { "f-sign": "Alex", "f-agree": true } },
    });
    expect(errors).toHaveLength(0);
  });

  it("treats an unticked required checkbox as missing", () => {
    const errors = intakeErrors({
      intakeForms: [{ ...optionalFieldForm, is_required: true }],
      intakeResponses: { "form-1": { "f-sign": "Alex", "f-agree": false } },
    });
    expect(errors).toHaveLength(1);
  });
});
