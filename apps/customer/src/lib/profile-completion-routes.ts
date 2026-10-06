/** Maps GET /api/me/profile-completion item ids to customer app routes. */
export function routeForProfileCompletionItem(itemId: string): string {
  switch (itemId) {
    case "date_of_birth":
      return "/(app)/safety/age-assurance";
    case "address":
      return "/(app)/account-settings/addresses";
    case "photo":
    case "email":
    case "phone":
    case "preferred_name":
      return "/(app)/account-settings/personal-info";
    case "identity":
      return "/(app)/account-settings/identity-verification";
    case "bio":
    case "profile_questions":
    case "interests":
      return "/(app)/account-settings/profile-details";
    case "beauty_preferences":
      return "/(app)/account-settings/beauty-preferences";
    case "emergency_contact":
      return "/(app)/account-settings/emergency-contact";
    default:
      return "/(app)/account-settings/personal-info";
  }
}

export function firstIncompleteRequiredRoute(
  items: { id: string; completed: boolean; required?: boolean }[] | undefined,
): string {
  const first = items?.find((item) => item.required === true && !item.completed);
  return first ? routeForProfileCompletionItem(first.id) : "/(app)/account-settings/personal-info";
}
