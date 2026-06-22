let celebrationVisible = false;
const listeners = new Set<() => void>();

export function setSetupCelebrationVisible(visible: boolean): void {
  if (celebrationVisible === visible) return;
  celebrationVisible = visible;
  listeners.forEach((listener) => listener());
}

export function isSetupCelebrationVisible(): boolean {
  return celebrationVisible;
}

export function subscribeSetupCelebrationVisible(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
