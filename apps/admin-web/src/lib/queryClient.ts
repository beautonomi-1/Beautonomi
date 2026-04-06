import { QueryClient } from "@tanstack/react-query";
import { AdminApiError, isForbiddenStatus, isUnauthorizedStatus } from "@beautonomi/admin-api-client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      /** Keep inactive list data longer when navigating — instant back navigation without refetch if still fresh. */
      gcTime: 15 * 60_000,
      retry: (failureCount, error) => {
        if (error instanceof AdminApiError && (isUnauthorizedStatus(error.status) || isForbiddenStatus(error.status))) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
