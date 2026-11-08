import { describe, expect, it } from "vitest";
import {
  sanitizeIntakeResponses,
  validateIntakeResponses,
  type ProviderIntakeForm,
} from "../CreateFormIntakeSection";

const form: ProviderIntakeForm = {
  id: "form-1",
  title: "Intake",
  is_required: false,
  fields: [
    { id: "f-name", name: "Allergies", field_type: "text", is_required: true },
    { id: "f-ok", name: "Patch test done", field_type: "checkbox", is_required: false },
  ],
};

describe("validateIntakeResponses", () => {
  it("fails when a required field has no answer", () => {
    expect(validateIntakeResponses([form], {})).toBe(false);
  });

  it("reads answers by field id, the shape the bookings API validates", () => {
    expect(validateIntakeResponses([form], { "form-1": { "f-name": "None" } })).toBe(true);
    expect(validateIntakeResponses([form], { "form-1": { Allergies: "None" } })).toBe(false);
  });

  it("makes every field required when the form is required", () => {
    const required = { ...form, is_required: true };
    expect(validateIntakeResponses([required], { "form-1": { "f-name": "None" } })).toBe(false);
    expect(
      validateIntakeResponses([required], { "form-1": { "f-name": "None", "f-ok": true } }),
    ).toBe(true);
  });
});

describe("sanitizeIntakeResponses", () => {
  it("drops blank answers and empty forms but keeps false checkboxes", () => {
    expect(
      sanitizeIntakeResponses({
        "form-1": { "f-name": "  ", "f-ok": false },
        "form-2": { "f-x": "" },
      }),
    ).toEqual({ "form-1": { "f-ok": false } });
  });
});
