import { describe, it, expect } from "vitest";
import {
  getMissingRequiredProviderFormField,
  providerFormsComplete,
  type ProviderFormLike,
  type ProviderFormResponsesMap,
} from "./providerFormValidation";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeForm(
  opts: {
    id?: string;
    title?: string;
    is_required?: boolean;
    fields?: { id: string; name: string; field_type: string; is_required: boolean }[];
  } = {},
): ProviderFormLike {
  return {
    id: opts.id ?? "form-1",
    title: opts.title ?? "Test form",
    is_required: opts.is_required ?? false,
    fields: opts.fields ?? [],
  };
}

// ─── getMissingRequiredProviderFormField ──────────────────────────────────────

describe("getMissingRequiredProviderFormField", () => {
  it("returns null when there are no forms", () => {
    expect(getMissingRequiredProviderFormField([], {})).toBeNull();
  });

  it("returns null when all forms are optional and have no responses", () => {
    const form = makeForm({
      is_required: false,
      fields: [{ id: "f1", name: "Name", field_type: "text", is_required: false }],
    });
    expect(getMissingRequiredProviderFormField([form], {})).toBeNull();
  });

  it("returns null when required field has a value", () => {
    const form = makeForm({
      fields: [{ id: "f1", name: "Name", field_type: "text", is_required: true }],
    });
    expect(getMissingRequiredProviderFormField([form], { "form-1": { f1: "Alice" } })).toBeNull();
  });

  it("returns missing field when required field has an empty string", () => {
    const form = makeForm({
      fields: [{ id: "f1", name: "Name", field_type: "text", is_required: true }],
    });
    const result = getMissingRequiredProviderFormField([form], { "form-1": { f1: "" } });
    expect(result).not.toBeNull();
    expect(result?.fieldId).toBe("f1");
  });

  it("returns missing field when required field is whitespace-only", () => {
    const form = makeForm({
      fields: [{ id: "f1", name: "Name", field_type: "text", is_required: true }],
    });
    const result = getMissingRequiredProviderFormField([form], { "form-1": { f1: "   " } });
    expect(result?.fieldId).toBe("f1");
  });

  it("returns missing field when required field has no response at all", () => {
    const form = makeForm({
      fields: [{ id: "f1", name: "Name", field_type: "text", is_required: true }],
    });
    expect(getMissingRequiredProviderFormField([form], {})).not.toBeNull();
  });

  it("treats field as required when form.is_required is true (field.is_required = false)", () => {
    const form = makeForm({
      is_required: true,
      fields: [{ id: "f1", name: "Name", field_type: "text", is_required: false }],
    });
    const result = getMissingRequiredProviderFormField([form], {});
    expect(result?.fieldId).toBe("f1");
  });

  it("treats field as required when field.is_required is true (form.is_required = false)", () => {
    const form = makeForm({
      is_required: false,
      fields: [{ id: "f1", name: "Name", field_type: "text", is_required: true }],
    });
    expect(getMissingRequiredProviderFormField([form], {})).not.toBeNull();
  });

  // ── checkbox ──────────────────────────────────────────────────────────────

  it("rejects checkbox with value false", () => {
    const form = makeForm({
      fields: [{ id: "f1", name: "I agree", field_type: "checkbox", is_required: true }],
    });
    const result = getMissingRequiredProviderFormField([form], { "form-1": { f1: false } });
    expect(result?.fieldId).toBe("f1");
  });

  it('rejects checkbox with string "false"', () => {
    const form = makeForm({
      fields: [{ id: "f1", name: "I agree", field_type: "checkbox", is_required: true }],
    });
    const result = getMissingRequiredProviderFormField([form], { "form-1": { f1: "false" as unknown as boolean } });
    expect(result?.fieldId).toBe("f1");
  });

  it("accepts checkbox with value true", () => {
    const form = makeForm({
      fields: [{ id: "f1", name: "I agree", field_type: "checkbox", is_required: true }],
    });
    expect(getMissingRequiredProviderFormField([form], { "form-1": { f1: true } })).toBeNull();
  });

  it("accepts unchecked checkbox when field is optional and form is optional", () => {
    const form = makeForm({
      is_required: false,
      fields: [{ id: "f1", name: "Newsletter", field_type: "checkbox", is_required: false }],
    });
    expect(getMissingRequiredProviderFormField([form], { "form-1": { f1: false } })).toBeNull();
  });

  // ── multi-form ────────────────────────────────────────────────────────────

  it("returns the first missing field across multiple forms", () => {
    const form1 = makeForm({
      id: "form-1", title: "Form 1",
      fields: [{ id: "f1", name: "Name", field_type: "text", is_required: true }],
    });
    const form2 = makeForm({
      id: "form-2", title: "Form 2",
      fields: [{ id: "f2", name: "Consent", field_type: "checkbox", is_required: true }],
    });
    // form1 field is filled; form2 checkbox is false
    const result = getMissingRequiredProviderFormField(
      [form1, form2],
      { "form-1": { f1: "Alice" }, "form-2": { f2: false } },
    );
    expect(result?.formId).toBe("form-2");
    expect(result?.fieldId).toBe("f2");
  });

  it("returns null when all forms are fully completed", () => {
    const form1 = makeForm({
      id: "form-1",
      fields: [{ id: "f1", name: "Name", field_type: "text", is_required: true }],
    });
    const form2 = makeForm({
      id: "form-2",
      fields: [{ id: "f2", name: "Consent", field_type: "checkbox", is_required: true }],
    });
    const responses: ProviderFormResponsesMap = {
      "form-1": { f1: "Alice" },
      "form-2": { f2: true },
    };
    expect(getMissingRequiredProviderFormField([form1, form2], responses)).toBeNull();
  });
});

// ─── providerFormsComplete ────────────────────────────────────────────────────

describe("providerFormsComplete", () => {
  it("returns true for empty forms list", () => {
    expect(providerFormsComplete([], {})).toBe(true);
  });

  it("returns false when a required checkbox is unchecked", () => {
    const form = makeForm({
      fields: [{ id: "f1", name: "I agree", field_type: "checkbox", is_required: true }],
    });
    expect(providerFormsComplete([form], { "form-1": { f1: false } })).toBe(false);
  });

  it("returns true when all required fields are filled", () => {
    const form = makeForm({
      fields: [
        { id: "f1", name: "Name", field_type: "text", is_required: true },
        { id: "f2", name: "Date", field_type: "date", is_required: false },
      ],
    });
    expect(providerFormsComplete([form], { "form-1": { f1: "Bob", f2: "2026-01-01" } })).toBe(true);
  });

  it("returns true when optional fields are missing", () => {
    const form = makeForm({
      is_required: false,
      fields: [{ id: "f1", name: "Notes", field_type: "text", is_required: false }],
    });
    expect(providerFormsComplete([form], {})).toBe(true);
  });
});
