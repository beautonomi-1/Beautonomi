/**
 * Appointment Sidebar Store
 * 
 * Simple store for managing appointment sidebar state.
 * Uses a singleton pattern with React useState for state management.
 * 
 * @module stores/appointment-sidebar-store
 */

import type { Appointment, GroupBooking } from "@/lib/provider-portal/types";
import type { ProviderBookingCreatedSuccessInput } from "@beautonomi/provider-booking";
import { normalizeGroupBookingId } from "@/lib/provider-booking/group-booking-utils";

// ============================================================================
// TYPES
// ============================================================================

export type SidebarMode = "closed" | "create" | "view" | "edit" | "group" | "success";

/** Primary mobile-shell view within create mode */
export type BookingCreateStep = "form" | "review";

/** Nested sub-sheets opened from view/edit (reschedule, refund, etc.) */
export type BookingSubSheet =
  | "none"
  | "reschedule"
  | "refund"
  | "product_picker"
  | "express_qr"
  | "audit"
  | "resources";

export type CollectIntent = "yoco" | "paycloud" | "paystack";

export type BookingSheetView =
  | "closed"
  | "create_form"
  | "create_review"
  | "view"
  | "edit"
  | "group"
  | "success";

export type GroupSheetMode = "create" | "view" | "edit";

export interface DraftSlot {
  staffId: string;
  staffName?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  locationId?: string;
  locationName?: string;
  /** Pre-select appointment type (In Salon, Walk-in, At Home) when opening create mode */
  appointmentKind?: "in_salon" | "walk_in" | "at_home";
  /** Prefill client fields (from waitlist, client profile, etc.) */
  prefillClientName?: string;
  prefillClientEmail?: string;
  prefillClientPhone?: string;
  prefillCustomerId?: string;
  prefillServiceId?: string;
}

export interface AppointmentSidebarState {
  mode: SidebarMode;
  selectedAppointmentId: string | null;
  selectedAppointment: Appointment | null;
  draftSlot: DraftSlot | null;
  isLoading: boolean;
  isSaving: boolean;
  sendNotification: boolean;
  /** Mobile shell view — derived from mode + create step */
  bookingSheetView: BookingSheetView;
  createStep: BookingCreateStep;
  subSheet: BookingSubSheet;
  groupSheetOpen: boolean;
  groupSheetMode: GroupSheetMode;
  selectedGroupBookingId: string | null;
  selectedGroupBooking: GroupBooking | null;
  productOrderSheetOpen: boolean;
  selectedProductOrderId: string | null;
  walkInSaleSheetOpen: boolean;
  successAppointmentId: string | null;
  successPayload: ProviderBookingCreatedSuccessInput | null;
  /** Auto-open terminal collect dialog when view sheet opens (from success sheet, etc.) */
  pendingCollectIntent: CollectIntent | null;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: AppointmentSidebarState = {
  mode: "closed",
  selectedAppointmentId: null,
  selectedAppointment: null,
  draftSlot: null,
  isLoading: false,
  isSaving: false,
  sendNotification: true,
  bookingSheetView: "closed",
  createStep: "form",
  subSheet: "none",
  groupSheetOpen: false,
  groupSheetMode: "create",
  selectedGroupBookingId: null,
  selectedGroupBooking: null,
  productOrderSheetOpen: false,
  selectedProductOrderId: null,
  walkInSaleSheetOpen: false,
  successAppointmentId: null,
  successPayload: null,
  pendingCollectIntent: null,
};

// ============================================================================
// STORE IMPLEMENTATION (using module-level state + callbacks)
// ============================================================================

let state: AppointmentSidebarState = { ...initialState };
const listeners = new Set<() => void>();

function getState(): AppointmentSidebarState {
  return state;
}

function setState(partial: Partial<AppointmentSidebarState>): void {
  state = { ...state, ...partial };
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Open sidebar in CREATE mode with a draft slot
 */
export function openCreateMode(draftSlot: DraftSlot): void {
  setState({
    mode: "create",
    selectedAppointmentId: null,
    selectedAppointment: null,
    draftSlot,
    isLoading: false,
    sendNotification: true,
    createStep: "form",
    subSheet: "none",
    groupSheetOpen: false,
    groupSheetMode: "create",
    selectedGroupBookingId: null,
    selectedGroupBooking: null,
    productOrderSheetOpen: false,
    selectedProductOrderId: null,
    walkInSaleSheetOpen: false,
    successAppointmentId: null,
    bookingSheetView: "create_form",
    pendingCollectIntent: null,
  });
}

/**
 * Open sidebar in VIEW mode and auto-open a terminal collect dialog.
 */
export function openViewModeWithCollect(
  appointment: Appointment,
  collect: CollectIntent,
): void {
  setState({
    mode: "view",
    selectedAppointmentId: appointment.id,
    selectedAppointment: appointment,
    draftSlot: null,
    isLoading: false,
    sendNotification: true,
    createStep: "form",
    subSheet: "none",
    groupSheetOpen: false,
    successAppointmentId: null,
    successPayload: null,
    bookingSheetView: "view",
    pendingCollectIntent: collect,
  });
}

export function clearPendingCollectIntent(): void {
  if (state.pendingCollectIntent) {
    setState({ pendingCollectIntent: null });
  }
}

export function openRefundSheet(): void {
  setState({ subSheet: "refund" });
}

export function switchToViewModeWithRefund(): void {
  if (state.mode !== "edit" && state.mode !== "view") return;
  setState({
    mode: "view",
    sendNotification: true,
    subSheet: "refund",
    bookingSheetView: "view",
  });
}

/**
 * Open sidebar in VIEW mode for an existing appointment
 */
export function openViewMode(appointment: Appointment): void {
  setState({
    mode: "view",
    selectedAppointmentId: appointment.id,
    selectedAppointment: appointment,
    draftSlot: null,
    isLoading: false,
    sendNotification: true,
    createStep: "form",
    subSheet: "none",
    groupSheetOpen: false,
    successAppointmentId: null,
    bookingSheetView: "view",
    pendingCollectIntent: null,
  });
}

/**
 * Switch to EDIT mode from VIEW mode
 */
export function switchToEditMode(): void {
  if (state.mode !== "view" || !state.selectedAppointment) return;
  setState({
    mode: "edit",
    subSheet: "none",
    bookingSheetView: "edit",
  });
}

/**
 * Switch back to VIEW mode from EDIT mode
 */
export function switchToViewMode(): void {
  if (state.mode !== "edit") return;
  setState({
    mode: "view",
    sendNotification: true,
    subSheet: "none",
    bookingSheetView: "view",
  });
}

/**
 * Close the sidebar
 */
export function closeSidebar(): void {
  setState({ ...initialState });
}

/**
 * Update the selected appointment (after refresh)
 */
export function updateSelectedAppointment(appointment: Appointment): void {
  if (state.selectedAppointmentId === appointment.id) {
    setState({ selectedAppointment: appointment });
  }
}

/**
 * Set loading state
 */
export function setLoading(isLoading: boolean): void {
  setState({ isLoading });
}

/**
 * Set saving state
 */
export function setSaving(isSaving: boolean): void {
  setState({ isSaving });
}

/**
 * Toggle send notification
 */
export function setSendNotification(send: boolean): void {
  setState({ sendNotification: send });
}

/**
 * Update draft slot
 */
export function updateDraftSlot(updates: Partial<DraftSlot>): void {
  if (!state.draftSlot) return;
  setState({
    draftSlot: { ...state.draftSlot, ...updates },
  });
}

export function setCreateStep(step: BookingCreateStep): void {
  if (state.mode !== "create") return;
  setState({
    createStep: step,
    bookingSheetView: step === "review" ? "create_review" : "create_form",
  });
}

export function openSubSheet(subSheet: BookingSubSheet): void {
  setState({ subSheet });
}

export function closeSubSheet(): void {
  setState({ subSheet: "none" });
}

export function openGroupSheet(): void {
  setState({
    mode: "group",
    groupSheetOpen: true,
    groupSheetMode: "create",
    selectedGroupBookingId: null,
    selectedGroupBooking: null,
    bookingSheetView: "group",
    productOrderSheetOpen: false,
    selectedProductOrderId: null,
    walkInSaleSheetOpen: false,
  });
}

export function openGroupViewMode(groupId: string): void {
  setState({
    mode: "group",
    groupSheetOpen: true,
    groupSheetMode: "view",
    selectedGroupBookingId: normalizeGroupBookingId(groupId),
    selectedGroupBooking: null,
    bookingSheetView: "group",
    selectedAppointmentId: null,
    selectedAppointment: null,
    draftSlot: null,
    productOrderSheetOpen: false,
    selectedProductOrderId: null,
    walkInSaleSheetOpen: false,
    pendingCollectIntent: null,
  });
}

export function openGroupEditMode(booking: GroupBooking): void {
  setState({
    mode: "group",
    groupSheetOpen: true,
    groupSheetMode: "edit",
    selectedGroupBookingId: normalizeGroupBookingId(booking.id),
    selectedGroupBooking: booking,
    bookingSheetView: "group",
  });
}

export function closeGroupSheet(): void {
  setState({
    mode: "closed",
    groupSheetOpen: false,
    groupSheetMode: "create",
    selectedGroupBookingId: null,
    selectedGroupBooking: null,
    bookingSheetView: "closed",
  });
}

export function openProductOrderView(orderId: string): void {
  setState({
    productOrderSheetOpen: true,
    selectedProductOrderId: orderId,
  });
}

export function closeProductOrderSheet(): void {
  setState({
    productOrderSheetOpen: false,
    selectedProductOrderId: null,
  });
}

export function openWalkInSaleSheet(): void {
  setState({
    walkInSaleSheetOpen: true,
  });
}

export function closeWalkInSaleSheet(): void {
  setState({
    walkInSaleSheetOpen: false,
  });
}

export function openSuccessMode(
  appointmentId: string,
  payload?: ProviderBookingCreatedSuccessInput | null,
): void {
  setState({
    mode: "success",
    successAppointmentId: appointmentId,
    successPayload: payload ?? null,
    bookingSheetView: "success",
    draftSlot: null,
  });
}

// ============================================================================
// REACT HOOK
// ============================================================================

import { useSyncExternalStore } from "react";

/**
 * React hook to access sidebar state
 */
export function useAppointmentSidebar() {
  const currentState = useSyncExternalStore(
    subscribe,
    getState,
    getState // Server snapshot
  );

  return {
    ...currentState,
    // Actions
    openCreateMode,
    openViewMode,
    switchToEditMode,
    switchToViewMode,
    closeSidebar,
    updateSelectedAppointment,
    setLoading,
    setSaving,
    setSendNotification,
    updateDraftSlot,
    setCreateStep,
    openSubSheet,
    closeSubSheet,
    openGroupSheet,
    openGroupViewMode,
    openGroupEditMode,
    closeGroupSheet,
    openProductOrderView,
    closeProductOrderSheet,
    openWalkInSaleSheet,
    closeWalkInSaleSheet,
    openSuccessMode,
    openViewModeWithCollect,
    clearPendingCollectIntent,
    openRefundSheet,
    switchToViewModeWithRefund,
    // Computed
    isOpen:
      currentState.mode !== "closed" ||
      currentState.groupSheetOpen ||
      currentState.productOrderSheetOpen ||
      currentState.walkInSaleSheetOpen,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getState as getSidebarState,
  setState as setSidebarState,
  subscribe as subscribeSidebar,
};
