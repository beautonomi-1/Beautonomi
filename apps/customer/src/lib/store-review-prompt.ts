import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { Platform } from "react-native";
import { openNativeStoreReview } from "@/lib/open-store-review";
import { getAnalyticsClient } from "@/lib/analytics-rn";

import {
  evaluateStoreReviewPrompt,
  type StoreReviewState,
  type StoreReviewStatus,
} from "@/lib/store-review-rules";

export type StoreReviewSource = "booking_review" | "client_rating" | "manual";

export type { StoreReviewState, StoreReviewStatus };
export { evaluateStoreReviewPrompt };

const STORAGE_PREFIX = "store_review:";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

async function loadState(userId: string): Promise<StoreReviewState | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as StoreReviewState;
  } catch {
    return null;
  }
}

async function saveState(userId: string, state: StoreReviewState): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(state)).catch(() => {});
}

export async function shouldPromptStoreReview(opts: {
  userId: string | null | undefined;
  stars: number;
  isEdit: boolean;
}): Promise<boolean> {
  if (!opts.userId?.trim()) return false;
  const state = await loadState(opts.userId);
  return evaluateStoreReviewPrompt(state, { stars: opts.stars, isEdit: opts.isEdit });
}

export async function recordManualStoreReview(userId: string | null | undefined): Promise<void> {
  if (!userId?.trim()) return;
  await saveState(userId, {
    status: "rated",
    promptCount: 0,
    lastPromptAt: null,
    lastHighRatingAt: new Date().toISOString(),
  });
}

export async function recordStoreReviewNotNow(userId: string): Promise<void> {
  const prev = (await loadState(userId)) ?? {
    status: "none" as const,
    promptCount: 0,
    lastPromptAt: null,
    lastHighRatingAt: null,
  };
  await saveState(userId, {
    ...prev,
    status: "not_now",
    promptCount: prev.promptCount + 1,
    lastPromptAt: new Date().toISOString(),
  });
}

export async function recordStoreReviewDontAsk(userId: string): Promise<void> {
  const prev = await loadState(userId);
  await saveState(userId, {
    status: "dont_ask",
    promptCount: prev?.promptCount ?? 0,
    lastPromptAt: prev?.lastPromptAt ?? null,
    lastHighRatingAt: prev?.lastHighRatingAt ?? null,
  });
}

export async function recordStoreReviewAccepted(userId: string): Promise<void> {
  await saveState(userId, {
    status: "rated",
    promptCount: 0,
    lastPromptAt: new Date().toISOString(),
    lastHighRatingAt: new Date().toISOString(),
  });
}

export async function requestAppStoreReview(): Promise<void> {
  try {
    const available = await StoreReview.isAvailableAsync();
    const reviewApi = StoreReview as typeof StoreReview & { hasAction?: () => Promise<boolean> };
    const hasAction = typeof reviewApi.hasAction === "function" ? await reviewApi.hasAction() : true;
    if (available && hasAction) {
      await StoreReview.requestReview();
      return;
    }
  } catch {
    // fall through to store URL
  }
  await openNativeStoreReview();
}

export function trackStoreReviewEvent(
  event: "store_review_prompt_shown" | "accepted" | "not_now" | "dont_ask" | "low_score_feedback",
  source: StoreReviewSource,
  extra?: Record<string, unknown>,
): void {
  try {
    getAnalyticsClient()?.logEvent(event, {
      source,
      platform: Platform.OS,
      ...extra,
    });
  } catch {
    // analytics must never block UX
  }
}
