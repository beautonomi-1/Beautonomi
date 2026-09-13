"use client";

import React from "react";
import { i18n } from "@beautonomi/i18n";
import { Button } from "@/components/ui/button";
import { closeSidebar } from "@/stores/appointment-sidebar-store";

interface BookingSheetHostErrorBoundaryProps {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

/** Isolates booking sheet crashes so the rest of the provider portal keeps working. */
export class BookingSheetHostErrorBoundary extends React.Component<
  BookingSheetHostErrorBoundaryProps,
  State
> {
  state: State = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || i18n.t("web.bookingSheetError.unknownError") };
  }

  componentDidCatch(error: Error) {
    console.error("[BookingSheetHost] booking sheet render error", error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: null });
  };

  private handleClose = () => {
    closeSidebar();
    this.setState({ hasError: false, errorMessage: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="fixed inset-x-0 bottom-0 z-[200] mx-auto flex max-w-2xl flex-col gap-3 rounded-t-3xl border border-amber-200 bg-amber-50 px-4 py-5 shadow-xl sm:px-6"
          role="alert"
          data-testid="booking-sheet-error-boundary"
        >
          <p className="text-sm font-semibold text-amber-950">{i18n.t("web.bookingSheetError.title")}</p>
          <p className="text-xs text-amber-800">
            {this.state.errorMessage ?? i18n.t("web.bookingSheetError.fallback")}
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={this.handleClose}>
              {i18n.t("common.close")}
            </Button>
            <Button type="button" size="sm" onClick={this.handleRetry}>
              {i18n.t("common.retry")}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
