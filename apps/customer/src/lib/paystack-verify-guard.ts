/**
 * Module-level guard that prevents duplicate Paystack verify calls for the
 * same reference within a single app session.
 *
 * Usage pattern:
 *  - The parent screen (book-checkout, custom-offer-checkout, etc.) calls
 *    `markReferenceProcessing(ref)` immediately after the WebBrowser session
 *    returns and before it calls verify/poll.
 *  - The deep-link route screen (book/paystack, shop/paystack, etc.) calls
 *    `isReferenceProcessing(ref)` on mount; if true it skips its own verify
 *    and navigates straight to the result screen.
 */

const processing = new Set<string>();

export function markReferenceProcessing(reference: string): void {
  if (reference) processing.add(reference);
}

export function isReferenceProcessing(reference: string): boolean {
  return !!reference && processing.has(reference);
}

export function clearReferenceProcessing(reference: string): void {
  processing.delete(reference);
}
