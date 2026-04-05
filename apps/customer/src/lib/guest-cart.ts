import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRuntimeMarketHost } from "@/config/public-env";
import { api } from "@/lib/api-client";
import { emitCartUpdated } from "@/lib/cart-events";
import type { CartItem } from "@/types/api";

const PREFIX = "beautonomi_guest_cart";

export function guestCartStorageKey(): string {
  const host = getRuntimeMarketHost().trim().toLowerCase() || "default";
  return `${PREFIX}:${host}`;
}

export interface GuestCartLine {
  product_id: string;
  product_variant_id?: string | null;
  quantity: number;
  name: string;
  retail_price: number;
  currency: string;
  image_url?: string | null;
  provider_id: string;
  provider_name: string;
  provider_slug: string;
}

export function guestLineKey(productId: string, variantId?: string | null): string {
  return `${productId}::${variantId ?? ""}`;
}

/** Stable cart row id for guest lines (UUIDs never contain `#`). */
export function syntheticGuestCartItemId(productId: string, variantId?: string | null): string {
  return `guest#${productId}#${variantId ?? ""}`;
}

export function parseSyntheticGuestCartItemId(
  id: string,
): { product_id: string; variant_id: string | null } | null {
  if (!id.startsWith("guest#")) return null;
  const rest = id.slice(6);
  const i = rest.indexOf("#");
  if (i <= 0) return null;
  const product_id = rest.slice(0, i);
  const tail = rest.slice(i + 1);
  return { product_id, variant_id: tail.length > 0 ? tail : null };
}

const GUEST_STOCK_PLACEHOLDER = 999;

export function guestLineToCartItem(line: GuestCartLine): CartItem {
  const id = syntheticGuestCartItemId(line.product_id, line.product_variant_id);
  const vid = line.product_variant_id ?? null;
  return {
    id,
    quantity: line.quantity,
    effective_price: line.retail_price,
    in_stock: true,
    stock_available: GUEST_STOCK_PLACEHOLDER,
    product_variant_id: vid,
    product_variant: vid
      ? {
          id: vid,
          retail_price: line.retail_price,
          quantity: GUEST_STOCK_PLACEHOLDER,
          option_values: {},
        }
      : null,
    product: {
      id: line.product_id,
      name: line.name,
      retail_price: line.retail_price,
      image_urls: line.image_url ? [line.image_url] : [],
      quantity: GUEST_STOCK_PLACEHOLDER,
    },
    provider: {
      id: line.provider_id,
      business_name: line.provider_name,
      slug: line.provider_slug,
    },
  };
}

export async function loadGuestCartLines(): Promise<GuestCartLine[]> {
  try {
    const raw = await AsyncStorage.getItem(guestCartStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is GuestCartLine =>
        row &&
        typeof row === "object" &&
        typeof (row as GuestCartLine).product_id === "string" &&
        typeof (row as GuestCartLine).quantity === "number" &&
        (row as GuestCartLine).quantity > 0,
    );
  } catch {
    return [];
  }
}

async function saveGuestCartLines(lines: GuestCartLine[]): Promise<void> {
  await AsyncStorage.setItem(guestCartStorageKey(), JSON.stringify(lines));
  emitCartUpdated();
}

export async function addOrIncrementGuestLine(line: GuestCartLine): Promise<void> {
  const lines = await loadGuestCartLines();
  const key = guestLineKey(line.product_id, line.product_variant_id);
  const idx = lines.findIndex(
    (l) => guestLineKey(l.product_id, l.product_variant_id) === key,
  );
  if (idx === -1) {
    lines.push({ ...line });
  } else {
    lines[idx] = {
      ...lines[idx],
      quantity: lines[idx].quantity + line.quantity,
      name: line.name,
      retail_price: line.retail_price,
      currency: line.currency,
      image_url: line.image_url ?? lines[idx].image_url,
      provider_id: line.provider_id,
      provider_name: line.provider_name,
      provider_slug: line.provider_slug,
    };
  }
  await saveGuestCartLines(lines);
}

export async function updateGuestLineQuantity(
  productId: string,
  variantId: string | null | undefined,
  quantity: number,
): Promise<void> {
  const lines = await loadGuestCartLines();
  const key = guestLineKey(productId, variantId);
  const next = lines
    .map((l) => {
      if (guestLineKey(l.product_id, l.product_variant_id) !== key) return l;
      return { ...l, quantity };
    })
    .filter((l) => l.quantity > 0);
  await saveGuestCartLines(next);
}

export async function removeGuestLine(productId: string, variantId: string | null | undefined): Promise<void> {
  const key = guestLineKey(productId, variantId);
  const lines = (await loadGuestCartLines()).filter(
    (l) => guestLineKey(l.product_id, l.product_variant_id) !== key,
  );
  await saveGuestCartLines(lines);
}

export async function clearGuestCart(): Promise<void> {
  await AsyncStorage.removeItem(guestCartStorageKey());
  emitCartUpdated();
}

export function guestCartItemCount(lines: GuestCartLine[]): number {
  return lines.reduce((s, l) => s + l.quantity, 0);
}

/** POST each guest line to the authenticated cart, then clear local guest storage (or keep only failed lines). */
export async function mergeGuestCartIntoServer(): Promise<void> {
  const lines = await loadGuestCartLines();
  if (lines.length === 0) return;
  const failed: GuestCartLine[] = [];
  for (const line of lines) {
    const body: Record<string, unknown> = {
      product_id: line.product_id,
      quantity: line.quantity,
    };
    if (line.product_variant_id) body.product_variant_id = line.product_variant_id;
    const res = await api.post("/api/me/cart", body);
    if (res.error) failed.push(line);
  }
  if (failed.length === lines.length) return;
  if (failed.length > 0) {
    await AsyncStorage.setItem(guestCartStorageKey(), JSON.stringify(failed));
    emitCartUpdated();
    return;
  }
  await clearGuestCart();
}
