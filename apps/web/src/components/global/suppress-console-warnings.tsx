"use client";

import { useEffect } from "react";

/**
 * SuppressConsoleWarnings Component
 * 
 * Filters out known harmless warnings from third-party libraries
 * (e.g., Recharts defaultProps deprecation warnings)
 */
export default function SuppressConsoleWarnings() {
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/89f3cdbd-444d-401b-9bce-c59a37625210',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'50ed8b'},body:JSON.stringify({sessionId:'50ed8b',location:'suppress-console-warnings.tsx:useEffect',message:'SuppressConsoleWarnings mounted',data:{},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    // Store original console methods
    const originalError = console.error;
    const originalWarn = console.warn;
    
    // Helper to check if message should be suppressed
    const shouldSuppress = (message: string): boolean => {
      const lowerMessage = message.toLowerCase();
      return (
        // Recharts defaultProps warnings
        ((lowerMessage.includes("defaultprops") || 
         lowerMessage.includes("default props") ||
         lowerMessage.includes("will be removed")) &&
        (lowerMessage.includes("xaxis") || 
         lowerMessage.includes("yaxis") ||
         lowerMessage.includes("recharts"))) ||
        // FetchTimeoutError - expected when database isn't set up
        (lowerMessage.includes("fetchtimeouterror") ||
         lowerMessage.includes("request timed out")) ||
        // User profile query timeout - expected when database is slow
        (lowerMessage.includes("user profile query timed out") ||
         lowerMessage.includes("using session data")) ||
        // Expected API errors when database is empty
        (lowerMessage.includes("no categories returned from api") ||
         (lowerMessage.includes("error loading") && lowerMessage.includes("timeout"))) ||
        // OneSignal App ID warning - expected when not configured
        (lowerMessage.includes("onesignal app id not configured") ||
         lowerMessage.includes("next_public_onesignal_app_id")) ||
        // Auth warnings when tab is hidden or user is already authenticated
        (lowerMessage.includes("roleguard: auth still loading after timeout") ||
         lowerMessage.includes("auth initialization taking too long")) ||
        // AbortError - expected when requests are cancelled (component unmounts, tab switches)
        (lowerMessage.includes("aborterror") ||
         lowerMessage.includes("signal is aborted") ||
         lowerMessage.includes("signal is aborted without reason") ||
         lowerMessage.includes("request was cancelled") ||
         (lowerMessage.includes("fetchtimeouterror") && lowerMessage.includes("cancelled"))) ||
        // Browser uses Google as network location provider for navigator.geolocation (not our API call)
        (lowerMessage.includes("network location provider") && lowerMessage.includes("googleapis")) ||
        // Next.js LCP image suggestion (noise in dev when using external images)
        (lowerMessage.includes("largest contentful paint") && lowerMessage.includes("loading"))
      );
    };
    
    // Override console.error
    console.error = (...args: any[]) => {
      const message = args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) {
          // Check error name and message - especially for AbortError
          // AbortErrors are expected and don't need logging
          return `${arg.name}: ${arg.message}`;
        }
        if (typeof arg === 'object' && arg !== null) {
          // Handle error objects with nested error properties
          if ('error' in arg && arg.error instanceof Error) {
            const nestedError = arg.error;
            // AbortErrors are expected and don't need logging
            return `${nestedError.name}: ${nestedError.message}`;
          }
          // Try to extract message from object
          if ('message' in arg && typeof arg.message === 'string') {
            return arg.message;
          }
          // Try JSON stringify for objects
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      
      if (shouldSuppress(message)) {
        return; // Suppress this warning
      }
      
      originalError.apply(console, args);
    };
    
    // Override console.warn (React sometimes uses this)
    console.warn = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'string' ? arg : String(arg)
      ).join(' ');
      
      const shouldSuppressResult = shouldSuppress(message);
      
      if (shouldSuppressResult) {
        return; // Suppress this warning
      }
      
      originalWarn.apply(console, args);
    };

    // Handle unhandled promise rejections (e.g., AbortError from fetch)
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      const errorMessage = error instanceof Error 
        ? `${error.name}: ${error.message}`
        : String(error);
      const lowerMessage = errorMessage.toLowerCase();
      
      // Suppress AbortErrors and FetchTimeoutError from cancelled requests
      // These are expected when requests are cancelled during component unmounts or navigation
      const isAbortError = lowerMessage.includes('aborterror') || 
          lowerMessage.includes('signal is aborted') ||
          lowerMessage.includes('signal is aborted without reason') ||
          (error instanceof Error && error.name === 'AbortError');
      
      const isCancelledRequest = lowerMessage.includes('request was cancelled') ||
          (error instanceof Error && error.name === 'FetchTimeoutError' && errorMessage.includes('cancelled'));
      
      if (isAbortError || isCancelledRequest) {
        event.preventDefault(); // Prevent default error logging
        return;
      }
      
      // For other unhandled rejections, log them normally
      originalError('[Unhandled Promise Rejection]', error);
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Cleanup: restore original console methods on unmount
    return () => {
      console.error = originalError;
      console.warn = originalWarn;
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}
