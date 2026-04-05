import { checkRateLimit, getClientIp, type RateLimitResult } from "./store";

const PUBLIC_MUTATION_CONFIG = {
  prefix: "public-mutation",
  limit: 15,
  windowSeconds: 15 * 60,
} as const;

export async function checkPublicMutationRateLimit(
  request: Request,
): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  return checkRateLimit(PUBLIC_MUTATION_CONFIG, ip);
}
