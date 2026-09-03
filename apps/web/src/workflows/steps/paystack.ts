/**
 * Durable step wrapper for Paystack API side effects.
 * Call only from `"use step"` functions — never from workflow orchestrators.
 */
export async function paystackStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`paystackStep(${label}): ${message}`, { cause: error });
  }
}
