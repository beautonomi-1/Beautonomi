/**
 * Single source of truth for “complete your profile” navigation from
 * FloatingProgressOrbit, /profile/complete, emails, etc.
 *
 * Checklist ids match GET /api/me/profile-completion (`checklistItems[].id`).
 */

const ACCOUNT = "/account-settings";
const CREATE_PROFILE = "/profile/create-profile";

export function getCompletionHref(itemId: string): string {
  switch (itemId) {
    case "photo":
      return `${ACCOUNT}#photo`;
    case "email":
      return `${ACCOUNT}?focus=email#personal-info-section`;
    case "preferred_name":
      return `${ACCOUNT}?focus=preferredName#personal-info-section`;
    case "bio":
      return `${CREATE_PROFILE}?highlight=bio`;
    case "identity":
      return `${ACCOUNT}?focus=identity#personal-info-section`;
    case "phone":
      return `${ACCOUNT}?focus=phone#personal-info-section`;
    case "address":
      return `${ACCOUNT}?focus=address#personal-info-section`;
    case "emergency_contact":
      return `${ACCOUNT}?focus=emergencyContact#personal-info-section`;
    case "profile_questions":
      return `${CREATE_PROFILE}?highlight=questions`;
    case "interests":
      return `${CREATE_PROFILE}?highlight=interests`;
    case "beauty_preferences":
      return `${ACCOUNT}?section=beauty_preferences#beauty-preferences-section`;
    default:
      return ACCOUNT;
  }
}

/** Valid `?focus=` values for PersonalInfoCard edit modals */
export function isPersonalInfoFocusParam(
  v: string | null
): v is "legalName" | "preferredName" | "email" | "phone" | "address" | "emergencyContact" | "identity" {
  return (
    v === "legalName" ||
    v === "preferredName" ||
    v === "email" ||
    v === "phone" ||
    v === "address" ||
    v === "emergencyContact" ||
    v === "identity"
  );
}
