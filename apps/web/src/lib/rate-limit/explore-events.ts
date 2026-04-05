import { checkRateLimit, getClientIp } from "./store";

const EXPLORE_EVENTS_CONFIG = {
  prefix: "explore-events",
  limit: 60,
  windowSeconds: 60,
} as const;

export async function checkExploreEventsRateLimit(
  request: Request,
): Promise<{ allowed: boolean; actorKey?: string }> {
  const ip = getClientIp(request);
  const ua = request.headers.get("user-agent") || "";
  const actorKey = `${ip}:${ua}`;
  const result = await checkRateLimit(EXPLORE_EVENTS_CONFIG, actorKey);
  return { allowed: result.allowed, actorKey };
}
