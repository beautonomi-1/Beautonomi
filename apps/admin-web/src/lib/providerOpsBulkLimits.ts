/** Max leads per bulk stage/assign/delete/ids request (server-enforced). */
export const PROVIDER_OPS_BULK_LEAD_MAX = 500;

/** Max agent actions per bulk approve/reject request (server-enforced). */
export const PROVIDER_OPS_BULK_AGENT_ACTION_MAX = 50;

/** WhatsApp bulk send batch cap (server + Wasender config; UI review step). */
export const PROVIDER_OPS_BULK_WHATSAPP_BATCH_MAX = 50;

/** Stages that cannot be set in bulk without per-lead matched_provider_id. */
export const PROVIDER_OPS_BULK_STAGE_EXCLUDE = new Set(["matched"]);

export function providerOpsBulkStageOptions<T extends string>(stages: readonly T[]): T[] {
  return stages.filter((s) => s !== "all" && !PROVIDER_OPS_BULK_STAGE_EXCLUDE.has(s));
}
