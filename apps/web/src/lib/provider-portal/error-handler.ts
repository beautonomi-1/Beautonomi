/**
 * Comprehensive error handling utilities for the provider portal
 */

import { toast } from "sonner";
import { FetchError, FetchTimeoutError } from "@/lib/http/fetcher";

export interface ErrorContext {
  action?: string;
  resource?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

/**
 * Get user-friendly error message from various error types
 */
export function getErrorMessage(error: unknown, context?: ErrorContext): string {
  if (error instanceof FetchTimeoutError) {
    return "Request timed out. Please check your connection and try again.";
  }

  if (error instanceof FetchError) {
    const status = error.status;
    const message = error.message;

    // Handle specific HTTP status codes
    switch (status) {
      case 400:
        return message || "Invalid request. Please check your input and try again.";
      case 401:
        return "You are not authorized to perform this action. Please log in again.";
      case 403:
        return "You don't have permission to access this resource.";
      case 404:
        return context?.resource
          ? `${context.resource} not found.`
          : "The requested resource was not found.";
      case 409:
        return "A conflict occurred. This may be due to a duplicate entry or concurrent modification.";
      case 422:
        return message || "Validation failed. Please check your input.";
      case 429:
        return "Too many requests. Please wait a moment and try again.";
      case 500:
        return "Server error. Please try again later or contact support if the problem persists.";
      case 503:
        return "Service temporarily unavailable. Please try again in a few moments.";
      default:
        return message || `An error occurred (${status}). Please try again.`;
    }
  }

  // Handle network errors
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return "Network error. Please check your internet connection and try again.";
  }

  // Handle generic errors
  if (error instanceof Error) {
    return error.message || "An unexpected error occurred.";
  }

  return "An unknown error occurred. Please try again.";
}

/**
 * Handle error with user notification and optional retry
 */
export function handleError(
  error: unknown,
  context?: ErrorContext,
  options?: {
    showToast?: boolean;
    logError?: boolean;
    onRetry?: () => void;
  }
): void {
  const { showToast = true, logError = true, onRetry } = options || {};
  const message = getErrorMessage(error, context);

  if (logError) {
    // Don't log FetchTimeoutError from cancelled requests (component unmounts)
    // Only log actual timeouts or other errors
    if (error instanceof FetchTimeoutError && error.message.includes('cancelled')) {
      // Silently ignore cancelled requests - they're expected during component unmounts
      return;
    }
    console.error(`[Provider Portal Error]`, {
      error,
      context,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  if (showToast) {
    if (onRetry) {
      toast.error(message, {
        action: {
          label: "Retry",
          onClick: onRetry,
        },
        duration: 5000,
      });
    } else {
      toast.error(message);
    }
  }
}

/**
 * Handle API errors with automatic retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    retryDelay?: number;
    onRetry?: (attempt: number) => void;
    shouldRetry?: (error: unknown) => boolean;
  }
): Promise<T> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    onRetry,
    shouldRetry = (error: unknown) => {
      // Retry on network errors and 5xx errors
      if (error instanceof FetchError) {
        return error.status >= 500 || error.status === 429;
      }
      return error instanceof FetchTimeoutError || error instanceof TypeError;
    },
  } = options || {};

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt or if error shouldn't be retried
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      const delay = retryDelay * Math.pow(2, attempt);
      if (onRetry) {
        onRetry(attempt + 1);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Validate API response structure
 */
export function validateResponse<T>(
  response: any,
  expectedFields?: string[]
): response is T {
  if (!response || typeof response !== "object") {
    return false;
  }

  if (expectedFields) {
    return expectedFields.every((field) => field in response);
  }

  return true;
}

/**
 * Safe async operation wrapper
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  fallback?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    handleError(error, { action: "safeAsync" }, { showToast: false });
    return fallback;
  }
}
