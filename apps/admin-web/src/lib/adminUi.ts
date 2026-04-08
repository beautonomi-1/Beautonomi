import { cn } from "@/lib/cn";

/** Segmented control / tab row — shared across list pages (bookings, disputes, …). Touch-friendly (§12). */
export function adminTabButtonClass(active: boolean): string {
  return cn(
    "inline-flex min-h-11 touch-manipulation items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
    active ? "bg-gray-900 text-white shadow-sm" : "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300"
  );
}

/** Pagination and secondary actions — min 44px height. */
export function adminToolbarButtonClass(disabled?: boolean): string {
  return cn(
    "inline-flex min-h-11 min-w-[5.5rem] touch-manipulation items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900 transition-colors",
    disabled ? "pointer-events-none opacity-40" : "hover:bg-gray-50 active:bg-gray-100"
  );
}
