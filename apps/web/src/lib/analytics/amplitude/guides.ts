/**
 * Amplitude Guides Integration
 *
 * Provides in-app guided experiences (tooltips, walkthroughs, modals)
 * powered by Amplitude Experiment. Guides are only shown when the
 * `guides_enabled` flag is true in AmplitudeConfig.
 */

import { fetchAmplitudeConfig } from "./config";

const GUIDE_DISMISSED_PREFIX = "amplitude_guide_dismissed_";
const GUIDE_SHOWN_PREFIX = "amplitude_guide_shown_";

interface GuideState {
  guideId: string;
  shown: boolean;
  dismissed: boolean;
  shownAt: string | null;
}

/**
 * Show a guide by its ID.
 * Records that the guide was shown in localStorage and dispatches
 * a custom DOM event that UI components can listen for.
 */
export async function showGuide(guideId: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    const config = await fetchAmplitudeConfig();
    if (!config.guides_enabled) {
      return false;
    }

    // Check if already dismissed
    const dismissedKey = `${GUIDE_DISMISSED_PREFIX}${guideId}`;
    if (localStorage.getItem(dismissedKey)) {
      return false;
    }

    // Record that the guide was shown
    const shownKey = `${GUIDE_SHOWN_PREFIX}${guideId}`;
    localStorage.setItem(shownKey, new Date().toISOString());

    // Dispatch event for UI layer to pick up
    window.dispatchEvent(
      new CustomEvent("amplitude:guide:show", {
        detail: { guideId },
      })
    );

    return true;
  } catch (error) {
    console.error("[Amplitude Guides] Error showing guide:", error);
    return false;
  }
}

/**
 * Dismiss a guide by its ID.
 * Persists dismissal in localStorage so it won't be shown again.
 */
export function dismissGuide(guideId: string): void {
  if (typeof window === "undefined") return;

  try {
    const dismissedKey = `${GUIDE_DISMISSED_PREFIX}${guideId}`;
    localStorage.setItem(dismissedKey, new Date().toISOString());

    window.dispatchEvent(
      new CustomEvent("amplitude:guide:dismiss", {
        detail: { guideId },
      })
    );
  } catch (error) {
    console.error("[Amplitude Guides] Error dismissing guide:", error);
  }
}

/**
 * Check whether a user is eligible to see a specific guide.
 *
 * Eligibility logic:
 * 1. `guides_enabled` must be true in remote config
 * 2. The guide must not have been previously dismissed
 * 3. Custom user-property checks can be added per guideId
 */
export async function checkGuideEligibility(
  userId: string,
  guideId: string
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    const config = await fetchAmplitudeConfig();

    if (!config.guides_enabled) {
      return false;
    }

    // Already dismissed?
    const dismissedKey = `${GUIDE_DISMISSED_PREFIX}${guideId}`;
    if (localStorage.getItem(dismissedKey)) {
      return false;
    }

    // Guide-specific eligibility rules
    switch (guideId) {
      case "onboarding_welcome": {
        // Show only once — check if it's ever been shown
        const shownKey = `${GUIDE_SHOWN_PREFIX}${guideId}`;
        return !localStorage.getItem(shownKey);
      }

      case "first_booking_guide": {
        // Show to users who haven't completed a booking yet
        const shownKey = `${GUIDE_SHOWN_PREFIX}${guideId}`;
        return !localStorage.getItem(shownKey);
      }

      case "explore_feed_intro": {
        const shownKey = `${GUIDE_SHOWN_PREFIX}${guideId}`;
        return !localStorage.getItem(shownKey);
      }

      default:
        // Unknown guide — eligible if not dismissed
        return true;
    }
  } catch (error) {
    console.error(
      "[Amplitude Guides] Error checking eligibility:",
      error
    );
    return false;
  }
}

/**
 * Get the current state for a guide.
 */
export function getGuideState(guideId: string): GuideState {
  if (typeof window === "undefined") {
    return { guideId, shown: false, dismissed: false, shownAt: null };
  }

  const shownKey = `${GUIDE_SHOWN_PREFIX}${guideId}`;
  const dismissedKey = `${GUIDE_DISMISSED_PREFIX}${guideId}`;
  const shownAt = localStorage.getItem(shownKey);

  return {
    guideId,
    shown: !!shownAt,
    dismissed: !!localStorage.getItem(dismissedKey),
    shownAt,
  };
}

/**
 * Reset a guide so it can be shown again (useful for testing).
 */
export function resetGuide(guideId: string): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem(`${GUIDE_SHOWN_PREFIX}${guideId}`);
  localStorage.removeItem(`${GUIDE_DISMISSED_PREFIX}${guideId}`);
}
