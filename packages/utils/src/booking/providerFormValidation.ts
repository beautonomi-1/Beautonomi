/**
 * Shared provider-form required-field validation logic.
 *
 * Rule: a field is required when `field.is_required || form.is_required`.
 * For `checkbox` fields, the value must be strictly `true`.
 * For all other field types, the value must be a non-empty trimmed string.
 *
 * This helper is framework-agnostic so it can be used in web (React), Expo,
 * and API routes without importing any UI primitives.
 */

export interface ProviderFormFieldLike {
  id: string;
  name: string;
  field_type: string;
  is_required: boolean;
}

export interface ProviderFormLike {
  id: string;
  title: string;
  is_required: boolean;
  fields?: ProviderFormFieldLike[] | null;
}

export type ProviderFormResponses = Record<
  string,
  Record<string, string | number | boolean | null> | undefined
>;

export interface MissingProviderFormField {
  formId: string;
  formTitle: string;
  fieldId: string;
  fieldName: string;
}

/**
 * Returns the first missing required provider form field, or `null` when all
 * requirements are satisfied.
 *
 * @param forms   Active provider forms (with nested fields).
 * @param responses  Current response map: `{ [formId]: { [fieldId]: value } }`.
 */
export function getMissingRequiredProviderFormField(
  forms: ProviderFormLike[],
  responses: ProviderFormResponses,
): MissingProviderFormField | null {
  for (const form of forms) {
    for (const field of form.fields ?? []) {
      if (!(field.is_required || form.is_required)) continue;

      const val = responses[form.id]?.[field.id];

      if (field.field_type === "checkbox") {
        if (val !== true) {
          return { formId: form.id, formTitle: form.title, fieldId: field.id, fieldName: field.name };
        }
      } else {
        if (val === undefined || val === null || String(val).trim() === "") {
          return { formId: form.id, formTitle: form.title, fieldId: field.id, fieldName: field.name };
        }
      }
    }
  }
  return null;
}

/**
 * Returns `true` when all required provider form fields have valid values.
 */
export function providerFormsComplete(
  forms: ProviderFormLike[],
  responses: ProviderFormResponses,
): boolean {
  return getMissingRequiredProviderFormField(forms, responses) === null;
}
