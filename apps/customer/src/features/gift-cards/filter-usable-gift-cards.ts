export type GiftCardListRow = {
  id: string;
  code?: string;
  balance?: number;
  currency?: string;
  is_active?: boolean | null;
  expires_at?: string | null;
  is_for_someone_else?: boolean;
};

export function filterUsableGiftCards(
  cards: GiftCardListRow[],
  currency: string,
): GiftCardListRow[] {
  const bookingCur = currency.trim();
  const now = Date.now();
  return cards.filter((c) => {
    if (c.is_for_someone_else) return false;
    if (!c?.code?.trim()) return false;
    if (Number(c.balance) <= 0) return false;
    if (c.is_active === false) return false;
    const cur = (c.currency || bookingCur).trim();
    if (cur !== bookingCur) return false;
    if (c.expires_at && new Date(c.expires_at).getTime() < now) return false;
    return true;
  });
}
