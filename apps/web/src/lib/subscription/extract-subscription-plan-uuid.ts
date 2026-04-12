/**
 * Subscription plan list endpoints expose a composite `id` per priced option
 * (e.g. `subscription_plans.id` + `:monthly` / `:yearly` / `:free`) so rows stay unique in UIs.
 * Database FKs and mutation APIs use the bare `subscription_plans.id` UUID only.
 */

export function extractSubscriptionPlanUuid(raw: string): string {
  if (raw.includes(":")) return raw.split(":")[0]!;
  return raw;
}

/** Guarantees `plan_id` is always the bare UUID even if a response branch omits it. */
export function ensurePlanOptionHasBarePlanId<T extends { id: string; plan_id?: string }>(
  option: T
): T & { plan_id: string } {
  const plan_id = option.plan_id ?? extractSubscriptionPlanUuid(option.id);
  return { ...option, plan_id };
}
