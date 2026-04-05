import type { PublicProviderCard } from "@/types/beautonomi";

/** Payload shape from GET /api/public/home `data` (after post-processing). */
export type HomePageInitialData = {
  all: PublicProviderCard[];
  topRated: PublicProviderCard[];
  nearest: PublicProviderCard[];
  hottest: PublicProviderCard[];
  upcoming: PublicProviderCard[];
  browseByCity: unknown[];
  sponsored?: PublicProviderCard[];
};
