/**
 * Name on a freelancer's bookable card.
 *
 * Onboarding stores the person's name as `owner_name` → `users.full_name`.
 * The staff row sometimes kept the business name, or the placeholder "Owner"
 * when that person name was missing at insert time.
 */
export function freelancerPublicStaffName(input: {
  staffName?: string | null;
  personName?: string | null;
  businessName?: string | null;
}): string {
  const staff = input.staffName?.trim() ?? "";
  const person = input.personName?.trim() ?? "";
  const business = input.businessName?.trim() ?? "";
  const storedBusinessOrPlaceholder =
    !staff ||
    staff.toLowerCase() === "owner" ||
    (business.length > 0 && staff === business);

  if (person && storedBusinessOrPlaceholder) return person;
  if (staff) return staff;
  if (person) return person;
  if (business) return business;
  return "Staff Member";
}
