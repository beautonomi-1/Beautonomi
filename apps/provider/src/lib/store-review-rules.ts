export type StoreReviewStatus = "none" | "not_now" | "dont_ask" | "rated";

export type StoreReviewState = {
  status: StoreReviewStatus;
  promptCount: number;
  lastPromptAt: string | null;
  lastHighRatingAt: string | null;
};

export const STORE_REVIEW_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;
export const STORE_REVIEW_MAX_PROMPTS = 2;

export function evaluateStoreReviewPrompt(
  state: StoreReviewState | null,
  opts: { stars: number; isEdit: boolean; now?: Date },
): boolean {
  if (opts.isEdit || opts.stars < 4) return false;
  if (!state) return true;
  if (state.status === "rated" || state.status === "dont_ask") return false;
  if (state.promptCount >= STORE_REVIEW_MAX_PROMPTS) return false;
  if (state.status === "not_now" && state.lastPromptAt) {
    const last = Date.parse(state.lastPromptAt);
    const now = opts.now?.getTime() ?? Date.now();
    if (Number.isFinite(last) && now - last < STORE_REVIEW_COOLDOWN_MS) return false;
  }
  return true;
}
