"use client";
import { useState, useEffect } from "react";

/**
 * Hook to detect mobile devices and screen sizes
 * Mobile-first approach: defaults to mobile, then enhances for larger screens
 */
export function useMobile() {
  const [isMobile, setIsMobile] = useState<boolean>(true);
  const [isTablet, setIsTablet] = useState<boolean>(false);
  const [isDesktop, setIsDesktop] = useState<boolean>(false);
  const [screenWidth, setScreenWidth] = useState<number>(0);

  useEffect(() => {
    // Set initial values
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setScreenWidth(width);
      
      // Mobile-first breakpoints
      // Mobile: < 640px (sm)
      // Tablet: 640px - 1024px (sm to lg)
      // Desktop: >= 1024px (lg+)
      setIsMobile(width < 640);
      setIsTablet(width >= 640 && width < 1024);
      setIsDesktop(width >= 1024);
    };

    // Check on mount
    checkScreenSize();

    // Listen for resize events with debounce
    let timeoutId: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkScreenSize, 150);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  return {
    isMobile,
    isTablet,
    isDesktop,
    screenWidth,
    // Convenience methods
    isSmallScreen: isMobile,
    isMediumScreen: isTablet,
    isLargeScreen: isDesktop,
  };
}

/**
 * Hook for responsive values
 * Returns different values based on screen size
 */
export function useResponsive<T>(values: {
  mobile: T;
  tablet?: T;
  desktop?: T;
}): T {
  const { isMobile: _isMobile, isTablet, isDesktop } = useMobile();

  if (isDesktop && values.desktop !== undefined) {
    return values.desktop;
  }
  if (isTablet && values.tablet !== undefined) {
    return values.tablet;
  }
  return values.mobile;
}
