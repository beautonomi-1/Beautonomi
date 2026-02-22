/**
 * Survey Helpers
 * Frequency capping and survey trigger utilities
 */

const SURVEY_FREQUENCY_KEY_PREFIX = "amplitude_survey_";
const SURVEY_RESPONSE_KEY_PREFIX = "amplitude_survey_response_";

/**
 * Check if survey should be shown based on frequency cap
 */
export function shouldShowSurvey(
  surveyId: string,
  frequencyDays: number
): boolean {
  if (typeof window === "undefined") return false;

  try {
    const key = `${SURVEY_FREQUENCY_KEY_PREFIX}${surveyId}`;
    const lastShown = localStorage.getItem(key);

    if (!lastShown) {
      return true;
    }

    const lastShownDate = new Date(lastShown);
    const now = new Date();
    const daysSince = (now.getTime() - lastShownDate.getTime()) / (1000 * 60 * 60 * 24);

    return daysSince >= frequencyDays;
  } catch (error) {
    console.error("[Amplitude Surveys] Error checking frequency cap:", error);
    return false;
  }
}

/**
 * Record that a survey was shown
 */
export function recordSurveyShown(surveyId: string): void {
  if (typeof window === "undefined") return;

  try {
    const key = `${SURVEY_FREQUENCY_KEY_PREFIX}${surveyId}`;
    localStorage.setItem(key, new Date().toISOString());
  } catch (error) {
    console.error("[Amplitude Surveys] Error recording survey shown:", error);
  }
}

/**
 * Check if post-booking survey should be shown (once per 30 days)
 */
export function shouldShowPostBookingSurvey(): boolean {
  return shouldShowSurvey("post_booking", 30);
}

/**
 * Check if post-payout survey should be shown (once per 90 days)
 */
export function shouldShowPostPayoutSurvey(): boolean {
  return shouldShowSurvey("post_payout", 90);
}

/**
 * Check if quarterly NPS survey should be shown (once per 90 days)
 */
export function shouldShowQuarterlyNPS(): boolean {
  return shouldShowSurvey("quarterly_nps", 90);
}

// ---------------------------------------------------------------------------
// SurveyManager — stateful manager for survey lifecycle
// ---------------------------------------------------------------------------

interface SurveyDefinition {
  id: string;
  /** Human-readable survey name */
  name: string;
  /** Minimum days between showing the same survey to the same user */
  frequencyDays: number;
  /** Trigger condition predicate — return true to show */
  shouldTrigger: (context: SurveyTriggerContext) => boolean;
}

export interface SurveyTriggerContext {
  /** Number of completed bookings for the current user */
  completedBookings: number;
  /** Whether this is the user's very first completed booking */
  isFirstBooking: boolean;
  /** User role */
  role?: string;
}

export interface SurveyResponse {
  surveyId: string;
  rating?: number;
  feedback?: string;
  answeredAt: string;
}

const BUILTIN_SURVEYS: SurveyDefinition[] = [
  {
    id: "onboarding_survey",
    name: "Onboarding Survey",
    frequencyDays: 365, // effectively once
    shouldTrigger: (ctx) => ctx.isFirstBooking,
  },
  {
    id: "provider_satisfaction_survey",
    name: "Provider Satisfaction Survey",
    frequencyDays: 90,
    shouldTrigger: (ctx) => ctx.completedBookings >= 10,
  },
];

/**
 * SurveyManager manages survey state, triggering, and frequency capping.
 *
 * Usage:
 * ```ts
 * const manager = new SurveyManager();
 * const pending = manager.getPendingSurveys({ completedBookings: 11, isFirstBooking: false });
 * if (pending.length > 0) {
 *   // show pending[0]
 *   manager.markShown(pending[0].id);
 * }
 * ```
 */
export class SurveyManager {
  private surveys: SurveyDefinition[];

  constructor(customSurveys?: SurveyDefinition[]) {
    this.surveys = [...BUILTIN_SURVEYS, ...(customSurveys ?? [])];
  }

  /**
   * Return all surveys whose trigger condition is met AND whose frequency
   * cap has not been exceeded.
   */
  getPendingSurveys(context: SurveyTriggerContext): SurveyDefinition[] {
    return this.surveys.filter((s) => {
      if (!s.shouldTrigger(context)) return false;
      return shouldShowSurvey(s.id, s.frequencyDays);
    });
  }

  /**
   * Mark a survey as shown (resets the frequency-cap timer).
   */
  markShown(surveyId: string): void {
    recordSurveyShown(surveyId);
  }

  /**
   * Record a user's response to a survey and persist to localStorage.
   */
  recordResponse(response: SurveyResponse): void {
    if (typeof window === "undefined") return;

    try {
      const key = `${SURVEY_RESPONSE_KEY_PREFIX}${response.surveyId}`;
      const existing = localStorage.getItem(key);
      const responses: SurveyResponse[] = existing
        ? JSON.parse(existing)
        : [];
      responses.push(response);
      localStorage.setItem(key, JSON.stringify(responses));
    } catch (error) {
      console.error(
        "[Amplitude Surveys] Error recording response:",
        error
      );
    }
  }

  /**
   * Get all stored responses for a survey.
   */
  getResponses(surveyId: string): SurveyResponse[] {
    if (typeof window === "undefined") return [];

    try {
      const key = `${SURVEY_RESPONSE_KEY_PREFIX}${surveyId}`;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Reset all survey state (useful for testing).
   */
  resetAll(): void {
    if (typeof window === "undefined") return;

    this.surveys.forEach((s) => {
      localStorage.removeItem(`${SURVEY_FREQUENCY_KEY_PREFIX}${s.id}`);
      localStorage.removeItem(`${SURVEY_RESPONSE_KEY_PREFIX}${s.id}`);
    });
  }
}

// Pre-built helper: check the onboarding survey (shown after first booking)
export function shouldShowOnboardingSurvey(
  context: SurveyTriggerContext
): boolean {
  const def = BUILTIN_SURVEYS.find((s) => s.id === "onboarding_survey");
  if (!def) return false;
  return def.shouldTrigger(context) && shouldShowSurvey(def.id, def.frequencyDays);
}

// Pre-built helper: check the provider satisfaction survey (shown after 10 bookings)
export function shouldShowProviderSatisfactionSurvey(
  context: SurveyTriggerContext
): boolean {
  const def = BUILTIN_SURVEYS.find(
    (s) => s.id === "provider_satisfaction_survey"
  );
  if (!def) return false;
  return def.shouldTrigger(context) && shouldShowSurvey(def.id, def.frequencyDays);
}
