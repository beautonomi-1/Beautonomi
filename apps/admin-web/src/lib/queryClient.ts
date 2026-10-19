import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { AdminApiError, isForbiddenStatus, isUnauthorizedStatus } from "@beautonomi/admin-api-client";
import { publicEnv } from "@/config/publicEnv";

function reportQueryError(error: unknown): void {
  if (!publicEnv.sentryDsn) return;
  if (
    error instanceof AdminApiError &&
    (isUnauthorizedStatus(error.status) || isForbiddenStatus(error.status))
  ) {
    return;
  }
  void import("@sentry/react").then(({ captureException }) => {
    captureException(error);
  });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => reportQueryError(error),
  }),
  mutationCache: new MutationCache({
    onError: (error) => reportQueryError(error),
  }),
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
