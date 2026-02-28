/**
 * API Response Convention - matches server { data, error } shape
 */

export interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
  /** HTTP status code when error comes from a failed response */
  status?: number;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}
