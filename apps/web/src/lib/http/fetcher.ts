/**
 * HTTP Fetcher Utility
 * 
 * A typed fetch wrapper with:
 * - Timeout support (default 12s)
 * - AbortController for cancellation
 * - FormData and JSON body support
 * - Typed errors
 * - Automatic error handling
 */

export interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown; // Can be object (JSON) or FormData
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export class FetchError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

export class FetchTimeoutError extends Error {
  constructor(message: string = 'Request timeout') {
    super(message);
    this.name = 'FetchTimeoutError';
  }
}

/**
 * Fetches JSON from an API endpoint with timeout and error handling
 * 
 * @param url - The API endpoint URL (relative or absolute)
 * @param options - Fetch options including method, body, headers, timeout
 * @returns Promise resolving to typed JSON response
 * @throws FetchError for HTTP errors, FetchTimeoutError for timeouts
 */
export async function fetchJson<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    timeoutMs = 10000, // Reduced to 10s for better responsiveness
    ...fetchOptions
  } = options;

  // Debug logging removed

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    // Debug logging removed
    controller.abort();
  }, timeoutMs);

  const requestStartTime = Date.now();
  try {
    // Prepare headers
    const requestHeaders: HeadersInit = {
      ...headers,
    };

    // Prepare body
    let requestBody: BodyInit | undefined;
    if (body) {
      if (body instanceof FormData) {
        // FormData - don't set Content-Type, browser will set it with boundary
        requestBody = body;
      } else {
        // JSON
        requestHeaders['Content-Type'] = 'application/json';
        requestBody = JSON.stringify(body);
      }
    }

    // Make request
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal: controller.signal,
      ...fetchOptions,
    });

    const _requestDuration = Date.now() - requestStartTime;
    // Debug logging removed

    // Clear timeout on success
    clearTimeout(timeoutId);

    // Handle non-OK responses
    if (!response.ok) {
      let errorData: { message?: string; code?: string; details?: unknown } = {};
      
      try {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const jsonData = await response.json();
          // Handle both { error: "..." } and { error: { message: "..." } } formats
          if (jsonData.error) {
            if (typeof jsonData.error === 'string') {
              errorData.message = jsonData.error;
            } else if (jsonData.error.message) {
              errorData.message = jsonData.error.message;
              errorData.code = jsonData.error.code;
              errorData.details = jsonData.error.details;
            }
          } else if (jsonData.message) {
            errorData.message = jsonData.message;
            errorData.code = jsonData.code;
            errorData.details = jsonData.details;
          } else {
            errorData = jsonData;
          }
        } else {
          const textResponse = await response.text();
          errorData.message = textResponse || `HTTP ${response.status}: ${response.statusText}`;
        }
      } catch {
        // If we can't parse the error response, use status text
        errorData.message = `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`;
      }

      // Provide default messages for common status codes if no message is available
      if (!errorData.message) {
        switch (response.status) {
          case 401:
            errorData.message = 'Authentication required';
            errorData.code = 'UNAUTHORIZED';
            break;
          case 403:
            errorData.message = 'Access forbidden';
            errorData.code = 'FORBIDDEN';
            break;
          case 404:
            errorData.message = 'Resource not found';
            errorData.code = 'NOT_FOUND';
            break;
          case 409:
            errorData.message = 'Conflict: Resource already exists or is unavailable';
            errorData.code = 'CONFLICT';
            break;
          case 500:
            errorData.message = 'Internal server error';
            errorData.code = 'INTERNAL_ERROR';
            break;
          default:
            errorData.message = `Request failed with status ${response.status}`;
        }
      }

      throw new FetchError(
        errorData.message,
        response.status,
        errorData.code,
        errorData.details
      );
    }

    // Parse JSON response
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const jsonData = await response.json();
      // Debug logging removed
      return jsonData;
    }

    // If no JSON content type, return empty object (or handle as needed)
    return {} as T;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort (timeout or cancellation)
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted') || error.message.includes('signal is aborted'))) {
      // Check if it was a timeout or manual cancellation
      // If the signal was aborted, it's either a timeout or component unmount
      // For cancellations (not timeouts), we still throw FetchTimeoutError but mark it as cancelled
      // The error handlers and unhandled rejection handler will suppress it
      const wasTimeout = timeoutId !== null && controller.signal.aborted;
      const errorMessage = wasTimeout 
        ? `Request timed out after ${timeoutMs}ms`
        : 'Request was cancelled';
      // Convert to FetchTimeoutError - error handlers will suppress cancelled requests
      const timeoutError = new FetchTimeoutError(errorMessage);
      // Mark cancelled requests so they can be identified and suppressed
      if (!wasTimeout) {
        (timeoutError as any).__cancelled = true;
      }
      throw timeoutError;
    }

    // Re-throw FetchError as-is
    if (error instanceof FetchError) {
      throw error;
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new FetchError(
        'Network error: Unable to reach server',
        0,
        'NETWORK_ERROR'
      );
    }

    // Unknown error
    throw new FetchError(
      error instanceof Error ? error.message : 'Unknown error occurred',
      0,
      'UNKNOWN_ERROR'
    );
  }
}

/**
 * Convenience methods for common HTTP methods
 */
export const fetcher = {
  get: <T = unknown>(url: string, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchJson<T>(url, { ...options, method: 'GET' }),

  post: <T = unknown>(url: string, body?: unknown, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchJson<T>(url, { ...options, method: 'POST', body }),

  patch: <T = unknown>(url: string, body?: unknown, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchJson<T>(url, { ...options, method: 'PATCH', body }),

  put: <T = unknown>(url: string, body?: unknown, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchJson<T>(url, { ...options, method: 'PUT', body }),

  delete: <T = unknown>(url: string, body?: unknown, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchJson<T>(url, { ...options, method: 'DELETE', body }),
};
