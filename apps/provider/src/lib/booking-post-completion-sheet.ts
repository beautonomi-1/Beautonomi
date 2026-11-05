export type LinkedExplorePostSummary = { id: string; status: "draft" | "published" } | null;

export type BookingPostCompletionSheetDecision =
  | { open: false }
  | { open: true; initialStep: "choose"; hideAddPhoto: false }
  | { open: true; initialStep: "rate"; hideAddPhoto: true }
  | { open: true; initialStep: "continue_draft"; draftPostId: string; hideAddPhoto: true };

export type BookingPostCompletionInputs = {
  bookingCompleted: boolean;
  modalAlreadySeen: boolean;
  postedJustNow: boolean;
  ratingLookupSettled: boolean;
  linkedPostLookupSettled: boolean;
  hasExistingRating: boolean;
  linkedPost: LinkedExplorePostSummary;
  linkedPostLookupFailed: boolean;
};

const RATE_ONLY = { open: true, initialStep: "rate", hideAddPhoto: true } as const;

/**
 * When to open the post-completion sheet and which step to show.
 * A failed linked-post lookup is not "no post" (the full mine list has timed out before).
 * posted=1 only arrives after a successful publish, so it never leads back to "Add a photo".
 */
export function decideBookingPostCompletionSheet(
  input: BookingPostCompletionInputs,
): BookingPostCompletionSheetDecision {
  if (!input.bookingCompleted) return { open: false };
  if (!input.ratingLookupSettled || !input.linkedPostLookupSettled) return { open: false };

  const mayOpen = !input.modalAlreadySeen || input.postedJustNow;
  if (!mayOpen) return { open: false };

  const linked = input.linkedPostLookupFailed ? null : input.linkedPost;
  const knownPublished = linked?.status === "published";

  if (knownPublished || input.postedJustNow) {
    return input.hasExistingRating ? { open: false } : RATE_ONLY;
  }

  if (input.linkedPostLookupFailed) return { open: false };

  if (linked?.status === "draft") {
    return { open: true, initialStep: "continue_draft", draftPostId: linked.id, hideAddPhoto: true };
  }

  return { open: true, initialStep: "choose", hideAddPhoto: false };
}
