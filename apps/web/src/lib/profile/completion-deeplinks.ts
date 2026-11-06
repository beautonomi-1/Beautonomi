/**
 * Single source of truth for “complete your profile” navigation from
 * FloatingProgressOrbit, /profile/complete, emails, etc.
 *
 * Checklist ids match GET /api/me/profile-completion (`checklistItems[].id`).
 */

const ACCOUNT = "/account-settings";
/** Profile sections (and the `focus` reader) are mounted only on this page, not on the hub. */
const PERSONAL_INFO = `${ACCOUNT}/personal-info`;
const PROFILE_DETAILS = `${ACCOUNT}/profile-details`;

export function getCompletionHref(itemId: string): string {
  switch (itemId) {
    case "photo":
      return `${PERSONAL_INFO}#photo`;
    case "email":
      return `${PERSONAL_INFO}?focus=email#personal-info-section`;
    case "preferred_name":
      return `${PERSONAL_INFO}?focus=preferredName#personal-info-section`;
    case "date_of_birth":
      return `${ACCOUNT}/age-assurance`;
    case "bio":
      return `${PROFILE_DETAILS}#about`;
    case "identity":
      return `${PERSONAL_INFO}?focus=identity#personal-info-section`;
    case "phone":
      return `${PERSONAL_INFO}?focus=phone#personal-info-section`;
    case "address":
      return `${PERSONAL_INFO}?focus=address#personal-info-section`;
    case "emergency_contact":
      return `${PERSONAL_INFO}?focus=emergencyContact#personal-info-section`;
    case "profile_questions":
      return `${PROFILE_DETAILS}#profile-questions`;
    case "interests":
      return `${PROFILE_DETAILS}#interests`;
    case "beauty_preferences":
      return `${PROFILE_DETAILS}#beauty-preferences`;
    default:
      return ACCOUNT;
  }
}

/** Hub banner target: the first required checklist item that is still incomplete. */
export function firstIncompleteRequiredItemId(
  items: { id: string; completed: boolean; required: boolean }[] | null | undefined,
): string | null {
  return items?.find((item) => item.required && !item.completed)?.id ?? null;
}

/** Valid `?focus=` values for PersonalInfoCard edit modals */
export function isPersonalInfoFocusParam(
  v: string | null
): v is "legalName" | "preferredName" | "email" | "phone" | "address" | "emergencyContact" | "identity" | "dateOfBirth" {
  return (
    v === "legalName" ||
    v === "preferredName" ||
    v === "email" ||
    v === "phone" ||
    v === "address" ||
    v === "emergencyContact" ||
    v === "identity" ||
    v === "dateOfBirth"
  );
}
