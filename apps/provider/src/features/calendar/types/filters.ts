export interface CalendarFilterStateV2 {
  staffKey: string;
  locationKey: string;
  paymentKey: "all" | "attention" | "paid";
  showCancelled: boolean;
}

/** Canonical filter state used by v2 hooks and filter UI. */
export interface CalendarFilters {
  staffFilter: string;
  locationFilter: string;
  statusFilters: string[];
  paymentFilter: "all" | "attention" | "paid";
  showAtHome: boolean;
}

export const DEFAULT_CALENDAR_FILTERS: CalendarFilters = {
  staffFilter: "all",
  locationFilter: "all",
  statusFilters: [],
  paymentFilter: "all",
  showAtHome: false,
};
