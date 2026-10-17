export type ExploreNavAgeBand = "under_13" | "13_17" | "18_plus" | "unknown";

export interface ShouldShowExploreNavParams {
  flagEnabled: boolean;
  signedIn: boolean;
  hideSocialFeed: boolean;
  ageBand: ExploreNavAgeBand;
}

/** Whether customer web Explore nav links should render (aligned with mobile home header). */
export function shouldShowExploreNav(params: ShouldShowExploreNavParams): boolean {
  const { flagEnabled, signedIn, hideSocialFeed, ageBand } = params;
  if (!flagEnabled) return false;
  if (!signedIn) return true;
  if (ageBand === "under_13") return false;
  if (hideSocialFeed) return false;
  return true;
}
