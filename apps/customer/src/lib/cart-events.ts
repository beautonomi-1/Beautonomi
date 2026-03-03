/**
 * Simple pub/sub for cart updates so the tab bar badge can refetch count
 * when the user adds to cart (product-detail) or removes an item (cart screen).
 */
const listeners: Array<() => void> = [];

export function emitCartUpdated(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (_) {}
  });
}

export function onCartUpdated(callback: () => void): () => void {
  listeners.push(callback);
  return () => {
    const i = listeners.indexOf(callback);
    if (i !== -1) listeners.splice(i, 1);
  };
}
