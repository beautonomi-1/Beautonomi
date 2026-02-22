/**
 * Appointment Sidebar Store
 * 
 * Simple store for managing appointment sidebar state.
 * Uses a singleton pattern with React useState for state management.
 * 
 * @module stores/appointment-sidebar-store
 */

import type { Appointment } from "@/lib/provider-portal/types";

// ============================================================================
// TYPES
// ============================================================================

export type SidebarMode = "closed" | "create" | "view" | "edit";

export interface DraftSlot {
  staffId: string;
  staffName?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  locationId?: string;
  locationName?: string;
  /** Pre-select appointment type (In Salon, Walk-in, At Home) when opening create mode */
  appointmentKind?: "in_salon" | "walk_in" | "at_home";
}

export interface AppointmentSidebarState {
  mode: SidebarMode;
  selectedAppointmentId: string | null;
  selectedAppointment: Appointment | null;
  draftSlot: DraftSlot | null;
  isLoading: boolean;
  isSaving: boolean;
  // Notification toggle state
  sendNotification: boolean;
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
  });
}

/**
 * Switch to EDIT mode from VIEW mode
 */
export function switchToEditMode(): void {
  if (state.mode !== "view" || !state.selectedAppointment) return;
  setState({
    mode: "edit",
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
    // Computed
    isOpen: currentState.mode !== "closed",
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
