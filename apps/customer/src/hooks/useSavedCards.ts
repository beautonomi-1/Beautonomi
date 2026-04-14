/**
 * Hook to fetch and manage saved payment methods (Paystack cards).
 * Cards are saved automatically via Paystack webhooks when save_card=true.
 */
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
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
      const res = await api.get<SavedPaymentMethod[] | { data: SavedPaymentMethod[] }>("/api/me/payment-methods");
      if (res.error) {
        setError((res.error as any)?.message || "Failed to load payment methods");
        return;
      }
      const raw = res.data;
      const list: SavedPaymentMethod[] = Array.isArray(raw)
        ? raw
        : (raw as { data: SavedPaymentMethod[] })?.data || [];
      setCards(list.filter((c) => c.is_active));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cards");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { fetch(); }, [fetch]);

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
