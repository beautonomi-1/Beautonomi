"use client";

import { useState, useEffect } from "react";

interface UseRatingModalOptions {
  /**
   * Minimum number of sessions before showing the rating modal
   * @default 3
   */
  minSessions?: number;
  /**
   * Minimum days since first visit before showing the rating modal
   * @default 7
   */
  minDays?: number;
  /**
   * Delay in milliseconds before showing the modal after conditions are met
   * @default 2000
   */
  delay?: number;
}

const STORAGE_KEYS = {
  SESSION_COUNT: "app_rating_session_count",
  FIRST_VISIT: "app_rating_first_visit",
  DISMISSED: "app_rating_dismissed",
};

export function useRatingModal(options: UseRatingModalOptions = {}) {
  const {
    minSessions = 3,
    minDays = 7,
    delay = 2000,
  } = options;

  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    // Check if user has already rated or dismissed recently
    const dismissed = localStorage.getItem(STORAGE_KEYS.DISMISSED);
    
    // If user rated, never show again
    if (dismissed === "rated") {
      return;
    }

    // If user clicked "Maybe Later", check if enough time has passed
    if (dismissed === "later") {
      const lastDismissed = localStorage.getItem("app_rating_last_dismissed");
      if (lastDismissed) {
        const daysSinceDismissal = Math.floor(
          (new Date().getTime() - new Date(lastDismissed).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        // Show again after 30 days
        if (daysSinceDismissal < 30) {
          return;
        }
        // Reset dismissal status after 30 days
        localStorage.removeItem(STORAGE_KEYS.DISMISSED);
      }
    }

    // Get or initialize session count
    let sessionCount = parseInt(
      localStorage.getItem(STORAGE_KEYS.SESSION_COUNT) || "0",
      10
    );
    sessionCount += 1;
    localStorage.setItem(STORAGE_KEYS.SESSION_COUNT, sessionCount.toString());

    // Get or set first visit date
    let firstVisit = localStorage.getItem(STORAGE_KEYS.FIRST_VISIT);
    if (!firstVisit) {
      firstVisit = new Date().toISOString();
      localStorage.setItem(STORAGE_KEYS.FIRST_VISIT, firstVisit);
    }

    // Check if conditions are met
    const daysSinceFirstVisit = Math.floor(
      (new Date().getTime() - new Date(firstVisit).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    const conditionsMet =
      sessionCount >= minSessions && daysSinceFirstVisit >= minDays;

    if (conditionsMet) {
      // Delay showing the modal
      const timer = setTimeout(() => {
        setShouldShow(true);
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [minSessions, minDays, delay]);

  const handleClose = (open: boolean) => {
    setShouldShow(open);
  };

  return {
    shouldShow,
    handleClose,
  };
}
