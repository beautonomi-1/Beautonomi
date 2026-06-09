export type BookingListStatsRow = { status?: string; total_amount?: number };

export type AdminBookingsListStats = {
  total: number;
  pending: number;
  confirmed: number;
  in_progress: number;
  completed: number;
  cancelled: number;
  no_show: number;
  completed_gmv: number;
};

export function computeAdminBookingsListStats(rows: BookingListStatsRow[]): AdminBookingsListStats {
  const stats: AdminBookingsListStats = {
    total: rows.length,
    pending: 0,
    confirmed: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    no_show: 0,
    completed_gmv: 0,
  };
  for (const row of rows) {
    const status = row.status ?? "";
    if (status === "pending" || status === "pending_payment") stats.pending += 1;
    else if (status === "confirmed") stats.confirmed += 1;
    else if (status === "in_progress") stats.in_progress += 1;
    else if (status === "completed") {
      stats.completed += 1;
      stats.completed_gmv += Number(row.total_amount ?? 0);
    } else if (status === "cancelled") stats.cancelled += 1;
    else if (status === "no_show") stats.no_show += 1;
  }
  return stats;
}
