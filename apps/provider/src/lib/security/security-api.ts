import type { SecurityApi } from "@beautonomi/auth-security";
import { api } from "@/lib/api-client";

/** Provider app adapter for @beautonomi/auth-security client flows. */
export const providerSecurityApi: SecurityApi = {
  get: <T,>(path: string) => api.get<T>(path),
  post: <T,>(path: string, body?: Record<string, unknown>) => api.post<T>(path, body ?? {}),
  delete: <T,>(path: string) => api.delete<T>(path),
};
