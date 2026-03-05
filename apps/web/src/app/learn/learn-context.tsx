"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

type LearnContextValue = {
  /** When false, show compact search in header (e.g. after hero scrolls out). */
  searchHeroVisible: boolean;
  setSearchHeroVisible: (v: boolean) => void;
  /** Mobile: full-screen search overlay open. */
  searchOverlayOpen: boolean;
  setSearchOverlayOpen: (v: boolean) => void;
};

const LearnContext = createContext<LearnContextValue | null>(null);

export function LearnProvider({ children }: { children: React.ReactNode }) {
  const [searchHeroVisible, setSearchHeroVisible] = useState(true);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  return (
    <LearnContext.Provider
      value={{
        searchHeroVisible,
        setSearchHeroVisible,
        searchOverlayOpen,
        setSearchOverlayOpen,
      }}
    >
      {children}
    </LearnContext.Provider>
  );
}

export function useLearnContext() {
  const ctx = useContext(LearnContext);
  return ctx ?? { searchHeroVisible: false, setSearchHeroVisible: () => {}, searchOverlayOpen: false, setSearchOverlayOpen: () => {} };
}
