import type { SettlementModel } from "./types";

export function resolveSettlementModel(config: Record<string, unknown>): SettlementModel {
  const raw = String(config.settlement_model ?? "platform_mor_transfer").trim();
  if (
    raw === "connected_mor_destination" ||
    raw === "separate_charges_transfers" ||
    raw === "platform_mor_transfer"
  ) {
    return raw;
  }
  return "platform_mor_transfer";
}
