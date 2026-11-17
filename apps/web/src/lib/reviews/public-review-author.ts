/**
 * Public review byline. A missing or anonymous name stays generic.
 * The customer's email is not used and is not returned.
 */
export function publicReviewAuthor(user: {
  id?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
}): { full_name: string; avatar_url: string | null; reviewerInitial: string } {
  const trimmed = user.full_name?.trim() ?? "";
  const anonymous = trimmed.length === 0 || /anon/i.test(trimmed);
  const full_name = !anonymous
    ? trimmed
    : user.id
      ? `Customer ${user.id.slice(0, 4).toUpperCase()}`
      : "Verified customer";
  return {
    full_name,
    avatar_url: user.avatar_url ?? null,
    reviewerInitial: full_name.charAt(0).toUpperCase(),
  };
}
