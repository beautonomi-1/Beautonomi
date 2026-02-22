/**
 * Time Block Sidebar Store
 * 
 * Manages state for time block creation and editing in the sidebar.
 * Supports both single blocks and repeating weekly patterns.
 * 
 * @module stores/time-block-sidebar-store
 */

import { useSyncExternalStore } from "react";
import type { TimeBlock, RecurrenceRule } from "@/lib/provider-portal/types";

// ============================================================================
// TYPES
// ============================================================================

export type BlockSidebarMode = "closed" | "create" | "view" | "edit";

export type BlockType = "break" | "lunch" | "meeting" | "personal" | "travel" | "custom";

export interface BlockDraft {
  staffId: string;
  staffName?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  name?: string;
  description?: string;
  blockType: BlockType;
  locationId?: string;
  locationName?: string;
  // Repeating pattern
  isRepeating: boolean;
  repeatDays?: number[]; // 0-6, Sunday-Saturday
  repeatUntil?: string; // YYYY-MM-DD
  // Override flags
  allowAppointmentOverride?: boolean;
}

export interface TimeBlockSidebarState {
  mode: BlockSidebarMode;
  selectedBlockId: string | null;
  selectedBlock: TimeBlock | null;
  draft: BlockDraft | null;
  isLoading: boolean;
  isSaving: boolean;
}

// ============================================================================
// BLOCK TYPE CONFIG
// ============================================================================

export const BLOCK_TYPE_CONFIG: Record<BlockType, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}> = {
  break: {
    label: "Break",
    color: "#92400E",
    bgColor: "#FEF3C7",
    borderColor: "#F59E0B",
    icon: "Coffee",
  },
  lunch: {
    label: "Lunch",
    color: "#92400E",
    bgColor: "#FEF3C7",
    borderColor: "#F59E0B",
    icon: "Utensils",
  },
  meeting: {
    label: "Meeting",
    color: "#1E40AF",
    bgColor: "#DBEAFE",
    borderColor: "#3B82F6",
    icon: "Users",
  },
  personal: {
    label: "Personal Time",
    color: "#5B21B6",
    bgColor: "#EDE9FE",
    borderColor: "#8B5CF6",
    icon: "User",
  },
  travel: {
    label: "Travel",
    color: "#0E7490",
    bgColor: "#CFFAFE",
    borderColor: "#06B6D4",
    icon: "Car",
  },
  custom: {
    label: "Blocked Time",
    color: "#4B5563",
    bgColor: "#E5E7EB",
    borderColor: "#9CA3AF",
    icon: "Ban",
  },
};

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: TimeBlockSidebarState = {
  mode: "closed",
  selectedBlockId: null,
  selectedBlock: null,
  draft: null,
  isLoading: false,
  isSaving: false,
};

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

let state: TimeBlockSidebarState = { ...initialState };
const listeners = new Set<() => void>();

function getState(): TimeBlockSidebarState {
  return state;
}

function setState(partial: Partial<TimeBlockSidebarState>): void {
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
 * Open sidebar in CREATE mode with a draft block
 */
export function openBlockCreateMode(draft: BlockDraft): void {
  setState({
    mode: "create",
    selectedBlockId: null,
    selectedBlock: null,
    draft,
    isLoading: false,
  });
}

/**
 * Open sidebar in VIEW mode for an existing block
 */
export function openBlockViewMode(block: TimeBlock): void {
  setState({
    mode: "view",
    selectedBlockId: block.id,
    selectedBlock: block,
    draft: null,
    isLoading: false,
  });
}

/**
 * Switch to EDIT mode from VIEW mode
 */
export function switchBlockToEditMode(): void {
  if (state.mode !== "view" || !state.selectedBlock) return;
  
  // Convert block to draft for editing
  const block = state.selectedBlock;
  const draft: BlockDraft = {
    staffId: block.team_member_id || "",
    staffName: block.team_member_name,
    date: block.date,
    startTime: block.start_time,
    endTime: block.end_time,
    name: block.name,
    description: block.description,
    blockType: inferBlockType(block),
    isRepeating: block.is_recurring,
    repeatDays: block.recurrence_rule?.days_of_week,
    repeatUntil: block.recurrence_rule?.end_date,
  };
  
  setState({
    mode: "edit",
    draft,
  });
}

/**
 * Switch back to VIEW mode from EDIT mode
 */
export function switchBlockToViewMode(): void {
  if (state.mode !== "edit") return;
  setState({
    mode: "view",
    draft: null,
  });
}

/**
 * Close the sidebar
 */
export function closeBlockSidebar(): void {
  setState({ ...initialState });
}

/**
 * Update the selected block (after refresh)
 */
export function updateSelectedBlock(block: TimeBlock): void {
  if (state.selectedBlockId === block.id) {
    setState({ selectedBlock: block });
  }
}

/**
 * Set loading state
 */
export function setBlockLoading(isLoading: boolean): void {
  setState({ isLoading });
}

/**
 * Set saving state
 */
export function setBlockSaving(isSaving: boolean): void {
  setState({ isSaving });
}

/**
 * Update draft block
 */
export function updateBlockDraft(updates: Partial<BlockDraft>): void {
  if (!state.draft) return;
  setState({
    draft: { ...state.draft, ...updates },
  });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Infer block type from time block data
 */
function inferBlockType(block: TimeBlock): BlockType {
  const name = (block.name || block.blocked_time_type_name || "").toLowerCase();
  
  if (name.includes("lunch")) return "lunch";
  if (name.includes("break")) return "break";
  if (name.includes("meeting")) return "meeting";
  if (name.includes("personal")) return "personal";
  if (name.includes("travel")) return "travel";
  
  return "custom";
}

/**
 * Create a recurrence rule from draft
 */
export function createRecurrenceRuleFromDraft(draft: BlockDraft): RecurrenceRule | undefined {
  if (!draft.isRepeating || !draft.repeatDays || draft.repeatDays.length === 0) {
    return undefined;
  }
  
  return {
    pattern: "weekly",
    interval: 1,
    days_of_week: draft.repeatDays,
    end_date: draft.repeatUntil,
  };
}

// ============================================================================
// REACT HOOK
// ============================================================================

/**
 * React hook to access time block sidebar state
 */
export function useTimeBlockSidebar() {
  const currentState = useSyncExternalStore(
    subscribe,
    getState,
    getState // Server snapshot
  );

  return {
    ...currentState,
    // Actions
    openBlockCreateMode,
    openBlockViewMode,
    switchBlockToEditMode,
    switchBlockToViewMode,
    closeBlockSidebar,
    updateSelectedBlock,
    setBlockLoading,
    setBlockSaving,
    updateBlockDraft,
    createRecurrenceRuleFromDraft,
    // Computed
    isOpen: currentState.mode !== "closed",
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

// Alias exports for compatibility
export function openEditTimeBlockMode(block: TimeBlock): void {
  openBlockViewMode(block);
  // Immediately switch to edit mode
  setTimeout(() => switchBlockToEditMode(), 0);
}

export function openCreateTimeBlockMode(draft: BlockDraft): void {
  openBlockCreateMode(draft);
}

export {
  getState as getBlockSidebarState,
  setState as setBlockSidebarState,
  subscribe as subscribeBlockSidebar,
};
