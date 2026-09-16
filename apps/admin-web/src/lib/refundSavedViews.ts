import {
  createDefaultSavedViewMatcher,
  matchAdminSavedView,
  type AdminSavedView,
} from "@/lib/adminSavedViews";

export type RefundsFilterState = {
  status: string;
  page: number;
};

export const REFUND_SAVED_VIEWS: AdminSavedView<RefundsFilterState>[] = [
  { id: "needs_action", label: "Needs action", params: { status: "needs_action" } },
  { id: "explained", label: "Explained", params: { status: "explained" } },
  { id: "pending", label: "Pending", params: { status: "pending" } },
  { id: "failed", label: "Failed", params: { status: "failed" } },
  { id: "all", label: "All", params: { status: "all" } },
];

const REFUND_VIEW_DEFAULTS: Partial<RefundsFilterState> = {
  status: "needs_action",
};

const refundViewMatcher = createDefaultSavedViewMatcher<RefundsFilterState>(REFUND_VIEW_DEFAULTS);

export function matchRefundSavedView(f: RefundsFilterState): string | null {
  return matchAdminSavedView(REFUND_SAVED_VIEWS, f, ["status"], refundViewMatcher);
}
