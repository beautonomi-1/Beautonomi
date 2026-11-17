import { addMoney, percentOf } from "@beautonomi/utils";

export function computeMarkupFromPrices(supply: number, retail: number): number {
  if (!Number.isFinite(supply) || supply <= 0) return 0;
  if (!Number.isFinite(retail)) return 0;
  return Math.round(((retail - supply) / supply) * 10000) / 100;
}

export function computeRetailFromMarkup(supply: number, markup: number): number {
  if (!Number.isFinite(supply) || supply < 0) return 0;
  if (!Number.isFinite(markup)) return supply;
  return addMoney(supply, percentOf(supply, markup));
}
