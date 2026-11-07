export function explorePostRequiresOfferingForPublish(input: {
  nextStatus: "draft" | "published";
  sourceBookingId: string | null;
  offeringId: string | null;
  wasAlreadyPublished: boolean;
  isPublishTransition: boolean;
  offeringClearedOnPublished: boolean;
}): boolean {
  if (input.nextStatus !== "published") return false;
  if (!input.sourceBookingId) return false;
  if (!input.offeringId) {
    if (input.isPublishTransition) return true;
    if (input.offeringClearedOnPublished) return true;
  }
  return false;
}

export function explorePostPublishOfferingError(): { message: string; code: string } {
  return {
    message: "A service is required when publishing a look tied to a completed visit.",
    code: "VALIDATION_ERROR",
  };
}
