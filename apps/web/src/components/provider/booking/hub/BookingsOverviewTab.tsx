"use client";
import { useTranslation } from "@beautonomi/i18n";



import { useEffect, useMemo, useState } from "react";

import {

  BOOKINGS_TO_REVIEW_STATUS,

  buildStatsReconciliationLine,

  statusFilterForStatsTile,

  type BookingsStatsRange,

  type BookingsStatsTileKey,

} from "@beautonomi/provider-booking";

import type { ProviderBookingAction } from "@/lib/provider-booking/action-policy";

import { Input } from "@/components/ui/input";

import { fetcher } from "@/lib/http/fetcher";

import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";

import { BookingSectionCard, BookingSectionLabel } from "../ui";

import { BookingScheduleCard, type HubScheduleBooking } from "./BookingScheduleCard";

import { useBookingsHubStats } from "./useBookingsHubStats";



const CLOSE_OUT_FILTER = "__close_out__";



const STATUS_CHIPS = [

  { id: "", labelKey: "web.provider.bookings.overview.all" },

  { id: BOOKINGS_TO_REVIEW_STATUS, labelKey: "web.provider.bookings.overview.toReview" },

  { id: "pending_payment", labelKey: "web.provider.bookings.overview.pendingPayment" },

  { id: "confirmed", labelKey: "web.provider.bookings.overview.confirmed" },

  { id: "in_progress", labelKey: "web.provider.bookings.overview.inProgress" },

  { id: "completed", labelKey: "web.provider.bookings.overview.completed" },

  { id: "cancelled", labelKey: "web.provider.bookings.overview.cancelled" },

  { id: "no_show", labelKey: "web.provider.bookings.overview.noShow" },

  { id: CLOSE_OUT_FILTER, labelKey: "web.provider.bookings.overview.closeOut" },

];



type CloseOutApiBooking = {

  id: string;

  booking_number?: string | null;

  scheduled_at: string;

  status: string;

  customer?: { full_name?: string | null } | null;

  booking_services?: Array<{ offering?: { title?: string | null } | null }> | null;

};



type CloseOutResponse = {

  summary: { total: number; today: number; older: number };

  bookings: CloseOutApiBooking[];

};



function mapCloseOutBooking(row: CloseOutApiBooking): HubScheduleBooking {

  return {

    id: row.id,

    booking_number: row.booking_number,

    status: row.status,

    scheduled_at: row.scheduled_at,

    customer_name: row.customer?.full_name ?? null,

    services: (row.booking_services ?? []).map((bs) => ({

      offering_name: bs.offering?.title ?? undefined,

    })),

  };

}



interface BookingsOverviewTabProps {

  bookings: HubScheduleBooking[];

  statsRange: BookingsStatsRange;

  locationId?: string;

  stalePendingCount?: number;

  onReviewStalePending?: () => void;

  onOpenBooking: (booking: HubScheduleBooking) => void;

  getPrimaryAction?: (booking: HubScheduleBooking) => ProviderBookingAction | null;

  onPrimaryAction?: (booking: HubScheduleBooking, action: ProviderBookingAction) => void;

  pendingActionIds?: Set<string>;

  openCloseOutQueue?: boolean;

}



export function BookingsOverviewTab({

  bookings,

  statsRange,

  locationId,

  stalePendingCount = 0,

  onReviewStalePending,

  onOpenBooking,

  getPrimaryAction,

  onPrimaryAction,

  pendingActionIds,

  openCloseOutQueue = false,

}: BookingsOverviewTabProps) {

  const { stats: apiStats } = useBookingsHubStats(statsRange, locationId);

  const { format: formatMoney } = useProviderMoneyFormat();
  const { t } = useTranslation();

  const [statusFilter, setStatusFilter] = useState(openCloseOutQueue ? CLOSE_OUT_FILTER : "");

  const [search, setSearch] = useState("");

  const [sortBy, setSortBy] = useState<"scheduled_at" | "booked_at">("scheduled_at");

  const [activeTile, setActiveTile] = useState<BookingsStatsTileKey | null>(null);

  const [closeOutQueue, setCloseOutQueue] = useState<CloseOutResponse | null>(null);

  const [expiringSoonPending, setExpiringSoonPending] = useState(0);



  useEffect(() => {

    let cancelled = false;

    (async () => {

      try {

        const params = new URLSearchParams();

        if (locationId) params.set("location_id", locationId);

        const qs = params.toString();

        const [closeOutRes, navRes] = await Promise.all([

          fetcher.get<{ data: CloseOutResponse }>(

            `/api/provider/bookings/close-out${qs ? `?${qs}` : ""}`,

          ),

          fetcher.get<{ data?: { expiring_soon_pending?: number } }>(

            `/api/provider/nav-counts${qs ? `?${qs}` : ""}`,

          ),

        ]);

        if (!cancelled) {

          setCloseOutQueue(closeOutRes.data ?? null);

          setExpiringSoonPending(Number(navRes?.data?.expiring_soon_pending ?? 0));

        }

      } catch {

        if (!cancelled) {

          setCloseOutQueue(null);

          setExpiringSoonPending(0);

        }

      }

    })();

    return () => {

      cancelled = true;

    };

  }, [locationId, bookings.length]);



  const closeOutBookings = useMemo(

    () => (closeOutQueue?.bookings ?? []).map(mapCloseOutBooking),

    [closeOutQueue],

  );



  const tiles: Array<{ key: BookingsStatsTileKey; label: string; value: string }> = [

    {

      key: "appointments",

      label: t("web.provider.bookings.overview.appointments"),

      value: String(apiStats?.appointment_count ?? 0),

    },

    { key: "pending", label: t("web.provider.bookings.overview.pending"), value: String(apiStats?.pending_count ?? 0) },

    { key: "confirmed", label: t("web.provider.bookings.overview.confirmed"), value: String(apiStats?.confirmed_count ?? 0) },

    { key: "active", label: t("web.provider.bookings.overview.inProgress"), value: String(apiStats?.in_progress_count ?? 0) },

    { key: "completed", label: t("web.provider.bookings.overview.completed"), value: String(apiStats?.completed_count ?? 0) },

    {

      key: "earned",

      label: t("web.provider.bookings.overview.bookedGmv"),

      value: apiStats?.booked_gmv != null ? formatMoney(apiStats.booked_gmv) : "—",

    },

  ];



  const filtered = useMemo(() => {

    let list =

      statusFilter === CLOSE_OUT_FILTER

        ? [...closeOutBookings]

        : [...bookings];



    if (statusFilter && statusFilter !== CLOSE_OUT_FILTER) {

      const statuses = statusFilter.split(",");

      list = list.filter((b) => statuses.includes((b.status || "").toLowerCase()));

    }

    if (search.trim()) {

      const q = search.toLowerCase();

      list = list.filter((b) => {

        const client = (b.customer_name || "").toLowerCase();

        const services = (b.services ?? [])

          .map((s) => (s.offering_name ?? s.service_name ?? s.name ?? "").toLowerCase())

          .join(" ");

        return client.includes(q) || services.includes(q);

      });

    }

    return list.sort((a, b) => {

      const ta =

        sortBy === "booked_at"

          ? a.created_at

            ? new Date(a.created_at).getTime()

            : 0

          : a.scheduled_at

            ? new Date(a.scheduled_at).getTime()

            : 0;

      const tb =

        sortBy === "booked_at"

          ? b.created_at

            ? new Date(b.created_at).getTime()

            : 0

          : b.scheduled_at

            ? new Date(b.scheduled_at).getTime()

            : 0;

      return ta - tb;

    });

  }, [bookings, closeOutBookings, statusFilter, search, sortBy]);



  const handleTileClick = (key: BookingsStatsTileKey) => {

    setActiveTile(key);

    setStatusFilter(statusFilterForStatsTile(key));

  };



  const applyCloseOutFilter = () => {

    setStatusFilter(CLOSE_OUT_FILTER);

    setActiveTile(null);

  };



  const applyExpiringSoonFilter = () => {

    setStatusFilter(BOOKINGS_TO_REVIEW_STATUS);

    setActiveTile("pending");

    onReviewStalePending?.();

  };



  const closeOutTotal = closeOutQueue?.summary.total ?? 0;



  return (

    <div className="px-4 pb-6 space-y-4">

      {closeOutTotal > 0 ? (

        <button

          type="button"

          onClick={applyCloseOutFilter}

          className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-start text-sm text-amber-950 touch-manipulation min-h-[44px]"

        >

          <span className="font-semibold">{t("web.provider.bookings.overview.unclosedCount", { count: closeOutTotal })}</span>{" "}

          {t("web.provider.bookings.overview.needCloseOut", { count: closeOutTotal })}

        </button>

      ) : null}



      {expiringSoonPending > 0 ? (

        <button

          type="button"

          onClick={applyExpiringSoonFilter}

          className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-start text-sm text-amber-950 touch-manipulation min-h-[44px]"

        >

          <span className="font-semibold">{t("web.provider.bookings.overview.pendingCount", { count: expiringSoonPending })}</span>{" "}

          {t("web.provider.bookings.overview.expiringSoon")}

        </button>

      ) : null}



      {stalePendingCount > 0 ? (

        <button

          type="button"

          onClick={() => {

            setStatusFilter(BOOKINGS_TO_REVIEW_STATUS);

            setActiveTile("pending");

            onReviewStalePending?.();

          }}

          className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-start text-sm text-amber-950 touch-manipulation min-h-[44px]"

        >

          <span className="font-semibold">{t("web.provider.bookings.overview.pendingCount", { count: stalePendingCount })}</span>{" "}

          {t("web.provider.bookings.overview.needAttention")}

        </button>

      ) : null}



      <div className="grid grid-cols-2 gap-2">

        {tiles.map((tile) => (

          <button

            key={tile.key}

            type="button"

            onClick={() => handleTileClick(tile.key)}

            className={`rounded-xl border bg-white p-3 text-start touch-manipulation min-h-[72px] ${

              activeTile === tile.key ? "border-gray-900 ring-1 ring-gray-900" : ""

            }`}

          >

            <p className="text-[10px] uppercase tracking-wide text-gray-500">{tile.label}</p>

            <p className="text-xl font-bold text-gray-900 truncate">{tile.value}</p>

          </button>

        ))}

      </div>



      {apiStats ? (

        <p className="text-xs text-gray-500">

          {buildStatsReconciliationLine({

            pending_count: apiStats.pending_count,

            confirmed_count: apiStats.confirmed_count ?? 0,

            in_progress_count: apiStats.in_progress_count,

            completed_count: apiStats.completed_count ?? 0,

            cancelled_count: apiStats.cancelled_count ?? 0,

            no_show_count: apiStats.no_show_count ?? 0,

          })}

          {apiStats.recognized_revenue > 0 ? (

            <span className="block mt-1">

              {t("web.provider.bookings.overview.recognizedRevenue", { amount: formatMoney(apiStats.recognized_revenue) })}

            </span>

          ) : null}

        </p>

      ) : null}



      <Input

        value={search}

        onChange={(e) => setSearch(e.target.value)}

        placeholder={t("web.provider.bookings.overview.searchClientOrService")}

        className="rounded-xl min-h-[44px]"

      />



      <div className="flex gap-2">

        <button

          type="button"

          onClick={() => setSortBy("scheduled_at")}

          className={`rounded-full px-3 py-1.5 text-xs font-semibold touch-manipulation min-h-[36px] ${

            sortBy === "scheduled_at" ? "bg-gray-900 text-white" : "bg-white border text-gray-700"

          }`}

        >

          {t("web.provider.bookings.overview.byAppointmentTime")}

        </button>

        <button

          type="button"

          onClick={() => setSortBy("booked_at")}

          className={`rounded-full px-3 py-1.5 text-xs font-semibold touch-manipulation min-h-[36px] ${

            sortBy === "booked_at" ? "bg-gray-900 text-white" : "bg-white border text-gray-700"

          }`}

        >

          {t("web.provider.bookings.overview.byBookedTime")}

        </button>

      </div>



      <div className="flex gap-2 overflow-x-auto pb-1">

        {STATUS_CHIPS.map((chip) => (

          <button

            key={chip.id || "all"}

            type="button"

            onClick={() => {

              setStatusFilter(chip.id);

              setActiveTile(null);

            }}

            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold touch-manipulation min-h-[36px] ${

              statusFilter === chip.id ? "bg-gray-900 text-white" : "bg-white border text-gray-700"

            }`}

          >

            {t(chip.labelKey)}

            {chip.id === CLOSE_OUT_FILTER && closeOutTotal > 0 ? ` (${closeOutTotal})` : ""}

          </button>

        ))}

      </div>



      <BookingSectionCard className="p-0 overflow-hidden">

        <BookingSectionLabel className="px-4 pt-4 pb-2">

          {statusFilter === CLOSE_OUT_FILTER
            ? t("web.provider.bookings.overview.closeOutQueueCount", { count: filtered.length })
            : t("web.provider.bookings.overview.bookingsCount", { count: filtered.length })}

        </BookingSectionLabel>

        {filtered.length === 0 ? (

          <p className="text-sm text-gray-500 px-4 pb-4">

            {statusFilter === CLOSE_OUT_FILTER

              ? t("web.provider.bookings.overview.closeOutEmptyNow")

              : t("web.provider.bookings.overview.noMatchFilter")}

          </p>

        ) : (

          <div className="divide-y">

            {filtered.map((b) => (

              <BookingScheduleCard

                key={b.id}

                booking={b}

                pending={pendingActionIds?.has(b.id)}

                primaryAction={getPrimaryAction?.(b) ?? null}

                onOpen={() => onOpenBooking(b)}

                onPrimaryAction={(booking, action) => onPrimaryAction?.(booking, action)}

              />

            ))}

          </div>

        )}

      </BookingSectionCard>

    </div>

  );

}


