import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import {
  filterUsableGiftCards,
  type GiftCardListRow,
} from "@/features/gift-cards/filter-usable-gift-cards";

export function useOwnedGiftCards(options: {
  currency: string;
  enabled?: boolean;
  userId?: string | null;
}): { cards: GiftCardListRow[]; loading: boolean } {
  const giftCardsEnabled = useFeatureFlag("gift_cards");
  const [cards, setCards] = useState<GiftCardListRow[]>([]);
  const [loading, setLoading] = useState(false);

  const enabled = options.enabled !== false && Boolean(options.userId) && giftCardsEnabled;

  useEffect(() => {
    if (!enabled) {
      setCards([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await api.get<{ gift_cards?: GiftCardListRow[] }>("/api/me/gift-cards");
        if (cancelled || res.error || !res.data) {
          if (!cancelled) setCards([]);
          return;
        }
        const list = Array.isArray(res.data.gift_cards) ? res.data.gift_cards : [];
        setCards(filterUsableGiftCards(list, options.currency));
      } catch {
        if (!cancelled) setCards([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, options.currency, options.userId]);

  return { cards, loading };
}
