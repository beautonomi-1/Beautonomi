"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface ProviderSidebarContextType {
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
}

const ProviderSidebarContext = createContext<ProviderSidebarContextType | undefined>(undefined);

export function ProviderSidebarProvider({ children }: { children: React.ReactNode }) {
  // Default to collapsed (false) instead of expanded (true)
  const [isExpanded, setIsExpanded] = useState(false);

  // Load sidebar state from localStorage on mount
  useEffect(() => {
    queueMicrotask(() => {
      const savedState = localStorage.getItem("provider-sidebar-expanded");
      if (savedState !== null) {
        setIsExpanded(savedState === "true");
      } else {
        setIsExpanded(false);
      }
    });
  }, []);

  // Save sidebar state to localStorage
  const handleSetExpanded = (expanded: boolean) => {
    setIsExpanded(expanded);
    localStorage.setItem("provider-sidebar-expanded", String(expanded));
  };

  return (
    <ProviderSidebarContext.Provider value={{ isExpanded, setIsExpanded: handleSetExpanded }}>
      {children}
    </ProviderSidebarContext.Provider>
  );
}

export function useProviderSidebar() {
  const context = useContext(ProviderSidebarContext);
  if (context === undefined) {
    throw new Error("useProviderSidebar must be used within a ProviderSidebarProvider");
  }
  return context;
}
