/** True when the buyer purchased a gift for another recipient and has not redeemed that card. */
export function computeIsGiftCardForSomeoneElse(params: {
  recipientEmail: string | null | undefined;
  userEmail: string;
  userRedeemedCard: boolean;
}): boolean {
  const recipientLower = params.recipientEmail?.trim().toLowerCase() ?? "";
  const userEmailLower = params.userEmail.trim().toLowerCase();
  return Boolean(
    recipientLower && recipientLower !== userEmailLower && !params.userRedeemedCard,
  );
}
