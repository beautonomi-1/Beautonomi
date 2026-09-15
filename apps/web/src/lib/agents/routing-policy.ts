import type { ModelCatalogEntry, ModelTask, ModelTier } from "@beautonomi/agent-model-router";

/** JSON stored in agent_module_config.default_routing_policy_id */
export type RoutingPolicy = {
  /** Pin specific tasks to model IDs when enabled in catalog. */
  taskModel?: Partial<Record<ModelTask, string>>;
  /** Override tier selection for specific tasks before routeModel heuristics. */
  taskTier?: Partial<Record<ModelTask, ModelTier>>;
  /** Force a default tier for all tasks when no taskTier entry matches. */
  defaultTier?: ModelTier;
};

export function parseRoutingPolicy(raw: string | null | undefined): RoutingPolicy | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as RoutingPolicy;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function applyRoutingPolicy(
  catalog: ModelCatalogEntry[],
  policy: RoutingPolicy | null,
): ModelCatalogEntry[] {
  if (!policy?.defaultTier) return catalog;
  return catalog.map((entry) =>
    entry.enabled ? { ...entry, tier: policy.defaultTier! } : entry,
  );
}

export function resolveTaskModelOverride(
  policy: RoutingPolicy | null,
  task: ModelTask,
  catalog: ModelCatalogEntry[],
): string | undefined {
  const id = policy?.taskModel?.[task];
  if (!id) return undefined;
  return catalog.some((c) => c.id === id && c.enabled) ? id : undefined;
}

export function resolveTaskTierOverride(
  policy: RoutingPolicy | null,
  task: ModelTask,
): ModelTier | undefined {
  return policy?.taskTier?.[task] ?? policy?.defaultTier;
}
