/**
 * Hook to fetch and manage saved payment methods (Paystack cards).
 * Cards are saved automatically via Paystack webhooks when save_card=true.
 *
 * Calls the canonical RESTful endpoints on apps/web:
 *   - GET    /api/me/payment-methods         (list)
 *   - DELETE /api/me/payment-methods/[id]    (soft-delete)
 *
 * Expired and inactive cards are filtered out of the returned list so
 * checkout selectors never offer a card that would fail at charge time.
 * Callers that need to surface expired cards (e.g. the manage screen) can
 * fetch the raw list directly.
 */
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import type { SavedPaymentMethod } from "@/types/api";

interface UseSavedCardsReturn {
  cards: SavedPaymentMethod[];
  loading: boolean;
  error: string | null;
  defaultCard: SavedPaymentMethod | null;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<boolean>;
}

export function useSavedCards(enabled = true): UseSavedCardsReturn {
  const [cards, setCards] = useState<SavedPaymentMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<SavedPaymentMethod[] | { data: SavedPaymentMethod[] }>(
        "/api/me/payment-methods"
      );
      if (res.error) {
        setError(getApiErrorMessage(res.error, "Failed to load payment methods"));
        return;
      }
      const raw = res.data;
      const list: SavedPaymentMethod[] = Array.isArray(raw)
        ? raw
        : (raw as { data: SavedPaymentMethod[] })?.data || [];
      setCards(list.filter((c) => c.is_active && !c.is_expired));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cards");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await api.delete(`/api/me/payment-methods/${id}`);
      if (res.error) return false;
      setCards((prev) => prev.filter((c) => c.id !== id));
      return true;
    } catch {
      return false;
    }
  }, []);

  const defaultCard = cards.find((c) => c.is_default) || cards[0] || null;

  return { cards, loading, error, defaultCard, refresh: fetch, remove };
}
