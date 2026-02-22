"use client";

/**
 * Enhanced Drag & Drop Calendar System
 * 
 * Phase 3 enhancements:
 * - Ghost preview while dragging
 * - Real-time pre-drop validation (green/red state)
 * - Snap indicator lines
 * - Keyboard accessibility (arrow keys + enter)
 * 
 * @module components/provider-portal/DragDropCalendar
 */

import React, { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Clock,
  User,
  ArrowRight,
  AlertTriangle,
  Check,
  X
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";


import { format, addMinutes } from "date-fns";
import { toast } from "sonner";
import type { Appointment, TeamMember, TimeBlock } from "@/lib/provider-portal/types";
import { 
  isMangomintModeEnabled, 
  canPlace, 
  toMangomintAppointment,
  toMangomintBlock,
  snapToIncrement,
  timeToMinutes,
  minutesToTime,
  type MangomintAppointment,
  type MangomintBlock
} from "@/lib/scheduling/mangomintAdapter";

interface DragState {
  appointment: Appointment;
  originalDate: string;
  originalTime: string;
  originalStaffId: string;
}

interface DropTarget {
  date: string;
  time: string;
  staffId: string;
}

interface RescheduleConfirmation {
  appointment: Appointment;
  newDate: string;
  newTime: string;
  newStaffId: string;
  newStaffName: string;
}

/** Validation result for pre-drop visualization */
interface ValidationResult {
  valid: boolean;
  reason?: string;
  conflictsWith?: string[];
}

interface DragDropContextValue {
  isDragging: boolean;
  dragState: DragState | null;
  dropTarget: DropTarget | null;
  /** Real-time validation state for current drop target */
  validationState: ValidationResult | null;
  /** Snap time for current drag position */
  snapTime: string | null;
  startDrag: (appointment: Appointment) => void;
  updateDropTarget: (target: DropTarget | null) => void;
  endDrag: () => void;
  confirmReschedule: () => void;
  cancelReschedule: () => void;
  /** Move appointment with keyboard */
  moveWithKeyboard: (direction: "up" | "down" | "left" | "right") => void;
  /** Focused appointment for keyboard navigation */
  focusedAppointmentId: string | null;
  setFocusedAppointmentId: (id: string | null) => void;
}

// Create context for drag-drop state
const DragDropContext = React.createContext<DragDropContextValue | null>(null);

export function useDragDrop() {
  const context = React.useContext(DragDropContext);
  if (!context) {
    throw new Error("useDragDrop must be used within a DragDropProvider");
  }
  return context;
}

interface DragDropProviderProps {
  children: React.ReactNode;
  teamMembers: TeamMember[];
  /** All appointments for conflict checking */
  allAppointments?: Appointment[];
  /** Time blocks for conflict checking */
  timeBlocks?: TimeBlock[];
  /** Whether to enable conflict validation (Mangomint mode) */
  enableConflictValidation?: boolean;
  onReschedule: (
    appointmentId: string,
    newDate: string,
    newTime: string,
    newStaffId: string
  ) => Promise<void>;
}

export function DragDropProvider({
  children,
  teamMembers,
  allAppointments = [],
  timeBlocks = [],
  enableConflictValidation = isMangomintModeEnabled(),
  onReschedule,
}: DragDropProviderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [rescheduleConfirmation, setRescheduleConfirmation] = useState<RescheduleConfirmation | null>(null);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [_conflictError, setConflictError] = useState<string | null>(null);
  const [validationState, setValidationState] = useState<ValidationResult | null>(null);
  const [snapTime, setSnapTime] = useState<string | null>(null);
  const [focusedAppointmentId, setFocusedAppointmentId] = useState<string | null>(null);
  
  // Time increment for snapping (15 min default)
  const timeIncrement = 15;

  const startDrag = useCallback((appointment: Appointment) => {
    setDragState({
      appointment,
      originalDate: appointment.scheduled_date,
      originalTime: appointment.scheduled_time,
      originalStaffId: appointment.team_member_id,
    });
    setIsDragging(true);
    setConflictError(null);
    setValidationState(null);
  }, []);

  const updateDropTarget = useCallback((target: DropTarget | null) => {
    setDropTarget(target);
    setConflictError(null);
    
    // Real-time validation when drop target changes
    if (target && dragState && enableConflictValidation) {
      // Snap the time to nearest increment
      const snappedTime = snapToIncrement(target.time, timeIncrement);
      setSnapTime(snappedTime);
      
      const result = validatePlacement(dragState.appointment, {
        ...target,
        time: snappedTime,
      });
      setValidationState(result);
    } else {
      setValidationState(null);
      setSnapTime(null);
    }
  }, [dragState, enableConflictValidation]);

  // Check if placement is valid using canPlace()
  const validatePlacement = useCallback((
    appointment: Appointment,
    target: DropTarget
  ): { valid: boolean; reason?: string } => {
    if (!enableConflictValidation) {
      return { valid: true };
    }

    // Convert appointments to Mangomint format for conflict checking
    const mangomintAppointments: MangomintAppointment[] = allAppointments
      .filter(apt => apt.id !== appointment.id) // Exclude the appointment being moved
      .filter(apt => apt.scheduled_date === target.date) // Same day only
      .map(apt => toMangomintAppointment(apt));

    // Convert time blocks
    const mangomintBlocks: MangomintBlock[] = timeBlocks
      .filter(block => block.date === target.date)
      .filter(block => !block.team_member_id || block.team_member_id === target.staffId)
      .map(block => toMangomintBlock(block));

    // Check if the new slot is valid
    const result = canPlace(
      {
        startTime: target.time,
        durationMinutes: appointment.duration_minutes,
        staffId: target.staffId,
      },
      {
        date: target.date,
        time: target.time,
        staffId: target.staffId,
      },
      mangomintAppointments,
      mangomintBlocks
    );

    return result;
  }, [enableConflictValidation, allAppointments, timeBlocks]);

  const endDrag = useCallback(() => {
    if (dragState && dropTarget) {
      const hasChanged =
        dropTarget.date !== dragState.originalDate ||
        dropTarget.time !== dragState.originalTime ||
        dropTarget.staffId !== dragState.originalStaffId;

      if (hasChanged) {
        // Validate placement before showing confirmation
        const validation = validatePlacement(dragState.appointment, dropTarget);
        
        if (!validation.valid) {
          setConflictError(validation.reason || "Cannot place appointment here");
          toast.error(validation.reason || "Cannot place appointment here - conflicts detected");
          // Don't clear dragState yet so user can try a different slot
          setDropTarget(null);
          return;
        }

        const newStaff = teamMembers.find((m) => m.id === dropTarget.staffId);
        setRescheduleConfirmation({
          appointment: dragState.appointment,
          newDate: dropTarget.date,
          newTime: dropTarget.time,
          newStaffId: dropTarget.staffId,
          newStaffName: newStaff?.name || "Unknown",
        });
      }
    }

    setIsDragging(false);
    setDragState(null);
    setDropTarget(null);
    setConflictError(null);
  }, [dragState, dropTarget, teamMembers, validatePlacement]);

  const confirmReschedule = useCallback(async () => {
    if (!rescheduleConfirmation) return;

    setIsRescheduling(true);
    try {
      await onReschedule(
        rescheduleConfirmation.appointment.id,
        rescheduleConfirmation.newDate,
        rescheduleConfirmation.newTime,
        rescheduleConfirmation.newStaffId
      );
      setRescheduleConfirmation(null);
    } catch (error) {
      console.error("Failed to reschedule:", error);
    } finally {
      setIsRescheduling(false);
    }
  }, [rescheduleConfirmation, onReschedule]);

  const cancelReschedule = useCallback(() => {
    setRescheduleConfirmation(null);
  }, []);

  // Keyboard navigation for moving appointments
  const moveWithKeyboard = useCallback((direction: "up" | "down" | "left" | "right") => {
    if (!focusedAppointmentId) return;
    
    const appointment = allAppointments.find(a => a.id === focusedAppointmentId);
    if (!appointment) return;
    
    const currentStaffIndex = teamMembers.findIndex(m => m.id === appointment.team_member_id);
    const currentMinutes = timeToMinutes(appointment.scheduled_time);
    
    let newTime = appointment.scheduled_time;
    let newStaffId = appointment.team_member_id;
    
    switch (direction) {
      case "up":
        // Move earlier by increment
        newTime = minutesToTime(Math.max(0, currentMinutes - timeIncrement));
        break;
      case "down":
        // Move later by increment
        newTime = minutesToTime(Math.min(24 * 60 - 1, currentMinutes + timeIncrement));
        break;
      case "left":
        // Move to previous staff member
        if (currentStaffIndex > 0) {
          newStaffId = teamMembers[currentStaffIndex - 1].id;
        }
        break;
      case "right":
        // Move to next staff member
        if (currentStaffIndex < teamMembers.length - 1) {
          newStaffId = teamMembers[currentStaffIndex + 1].id;
        }
        break;
    }
    
    // Check if we can move there
    if (enableConflictValidation) {
      const validation = validatePlacement(appointment, {
        date: appointment.scheduled_date,
        time: newTime,
        staffId: newStaffId,
      });
      
      if (!validation.valid) {
        toast.error(validation.reason || "Cannot move to this slot");
        return;
      }
    }
    
    // If position changed, trigger reschedule
    if (newTime !== appointment.scheduled_time || newStaffId !== appointment.team_member_id) {
      onReschedule(
        appointment.id,
        appointment.scheduled_date,
        newTime,
        newStaffId
      ).then(() => {
        toast.success("Appointment moved");
      }).catch((error) => {
        console.error("Failed to move appointment:", error);
        toast.error("Failed to move appointment");
      });
    }
  }, [focusedAppointmentId, allAppointments, teamMembers, enableConflictValidation, onReschedule, timeIncrement]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!focusedAppointmentId) return;
      
      // Arrow keys for moving
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const direction = e.key.replace("Arrow", "").toLowerCase() as "up" | "down" | "left" | "right";
        moveWithKeyboard(direction);
      }
      
      // Escape to clear focus
      if (e.key === "Escape") {
        setFocusedAppointmentId(null);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedAppointmentId, moveWithKeyboard]);

  const formatTime12h = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minute.toString().padStart(2, "0")} ${ampm}`;
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "EEE, MMM d, yyyy");
  };

  const getEndTime = (startTime: string, durationMinutes: number) => {
    const [hour, minute] = startTime.split(":").map(Number);
    const endDate = addMinutes(new Date(2000, 0, 1, hour, minute), durationMinutes);
    return format(endDate, "HH:mm");
  };

  return (
    <DragDropContext.Provider
      value={{
        isDragging,
        dragState,
        dropTarget,
        validationState,
        snapTime,
        startDrag,
        updateDropTarget,
        endDrag,
        confirmReschedule,
        cancelReschedule,
        moveWithKeyboard,
        focusedAppointmentId,
        setFocusedAppointmentId,
      }}
    >
      {children}

      {/* Reschedule Confirmation Dialog */}
      <Dialog open={!!rescheduleConfirmation} onOpenChange={() => cancelReschedule()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Reschedule</DialogTitle>
            <DialogDescription>
              Review the changes before confirming.
            </DialogDescription>
          </DialogHeader>

          {rescheduleConfirmation && (
            <div className="space-y-4 py-4">
              {/* Client & Service Info */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-[#FF0077]/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-[#FF0077]" />
                </div>
                <div>
                  <p className="font-semibold">
                    {rescheduleConfirmation.appointment.client_name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {rescheduleConfirmation.appointment.service_name}
                  </p>
                </div>
              </div>

              {/* Change Summary */}
              <div className="space-y-3">
                {/* Date Change */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-1">From</p>
                    <p className="font-medium">
                      {formatDate(rescheduleConfirmation.appointment.scheduled_date)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {formatTime12h(rescheduleConfirmation.appointment.scheduled_time)} -{" "}
                      {formatTime12h(
                        getEndTime(
                          rescheduleConfirmation.appointment.scheduled_time,
                          rescheduleConfirmation.appointment.duration_minutes
                        )
                      )}
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                  <div className="flex-1 text-right">
                    <p className="text-xs text-gray-500 mb-1">To</p>
                    <p className="font-medium text-[#FF0077]">
                      {formatDate(rescheduleConfirmation.newDate)}
                    </p>
                    <p className="text-sm text-[#FF0077]">
                      {formatTime12h(rescheduleConfirmation.newTime)} -{" "}
                      {formatTime12h(
                        getEndTime(
                          rescheduleConfirmation.newTime,
                          rescheduleConfirmation.appointment.duration_minutes
                        )
                      )}
                    </p>
                  </div>
                </div>

                {/* Staff Change (if different) */}
                {rescheduleConfirmation.newStaffId !==
                  rescheduleConfirmation.appointment.team_member_id && (
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                    <User className="w-5 h-5 text-blue-600" />
                    <div className="flex-1">
                      <p className="text-sm text-blue-600">
                        Assigned to: <span className="font-semibold">{rescheduleConfirmation.newStaffName}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  The client will be notified about this schedule change.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelReschedule}>
              Cancel
            </Button>
            <Button
              onClick={confirmReschedule}
              disabled={isRescheduling}
              className="bg-[#FF0077] hover:bg-[#D60565]"
            >
              {isRescheduling ? "Rescheduling..." : "Confirm Reschedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DragDropContext.Provider>
  );
}

// Draggable appointment wrapper
interface DraggableAppointmentProps {
  appointment: Appointment;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Allow keyboard navigation */
  enableKeyboardNav?: boolean;
}

export function DraggableAppointment({
  appointment,
  children,
  className,
  style,
  enableKeyboardNav = true,
}: DraggableAppointmentProps) {
  const { 
    startDrag, 
    endDrag, 
    isDragging, 
    dragState,
    focusedAppointmentId,
    setFocusedAppointmentId,
  } = useDragDrop();
  const isDraggingThis = isDragging && dragState?.appointment.id === appointment.id;
  const isFocused = focusedAppointmentId === appointment.id;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", appointment.id);
    startDrag(appointment);
  };

  const handleDragEnd = () => {
    endDrag();
  };

  const handleFocus = () => {
    if (enableKeyboardNav) {
      setFocusedAppointmentId(appointment.id);
    }
  };

  const handleBlur = () => {
    // Don't clear immediately - allow keyboard events to process
    setTimeout(() => {
      if (focusedAppointmentId === appointment.id) {
        // Only clear if this appointment is still focused
      }
    }, 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter to open details (parent component handles this)
    if (e.key === "Enter") {
      e.preventDefault();
      // Let the click handler in parent take care of opening details
    }
  };

  return (
    <div
      draggable
      tabIndex={enableKeyboardNav ? 0 : undefined}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={cn(
        "cursor-grab active:cursor-grabbing",
        "focus:outline-none focus:ring-2 focus:ring-[#FF0077] focus:ring-offset-1",
        isDraggingThis && "opacity-50",
        isFocused && "ring-2 ring-[#FF0077] ring-offset-1",
        className
      )}
      style={style}
      aria-label={`Appointment: ${appointment.client_name} for ${appointment.service_name} at ${appointment.scheduled_time}`}
    >
      {children}
      
      {/* Keyboard navigation hint */}
      {isFocused && enableKeyboardNav && (
        <div className="absolute -bottom-6 left-0 right-0 text-[10px] text-center text-gray-400 whitespace-nowrap z-50 pointer-events-none">
          Use arrow keys to move • Esc to deselect
        </div>
      )}
    </div>
  );
}

// Droppable time slot wrapper
interface DroppableTimeSlotProps {
  date: string;
  time: string;
  staffId: string;
  children: React.ReactNode;
  className?: string;
}

export function DroppableTimeSlot({
  date,
  time,
  staffId,
  children,
  className,
}: DroppableTimeSlotProps) {
  const { isDragging, updateDropTarget, dropTarget, validationState, snapTime } = useDragDrop();
  const [_isOver, setIsOver] = useState(false);

  const isCurrentDropTarget =
    dropTarget?.date === date &&
    dropTarget?.staffId === staffId &&
    (dropTarget?.time === time || snapTime === time);

  // Determine border color based on validation
  const getValidationColors = () => {
    if (!isCurrentDropTarget || !validationState) {
      return {
        ring: "ring-[#FF0077]",
        bg: "bg-[#FF0077]/10",
      };
    }
    
    if (validationState.valid) {
      return {
        ring: "ring-green-500",
        bg: "bg-green-100",
      };
    }
    
    return {
      ring: "ring-red-500",
      bg: "bg-red-100",
    };
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setIsOver(true);
    updateDropTarget({ date, time, staffId });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setIsOver(false);
    // The actual reschedule is handled by endDrag in the provider
  };

  const colors = getValidationColors();

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "transition-colors relative",
        isDragging && "bg-gray-50",
        isCurrentDropTarget && `${colors.bg} ring-2 ${colors.ring} ring-inset`,
        className
      )}
    >
      {children}
      
      {/* Validation indicator tooltip */}
      {isCurrentDropTarget && validationState && !validationState.valid && (
        <div className="absolute top-1 left-1 right-1 z-50 pointer-events-none">
          <div className="bg-red-600 text-white text-xs px-2 py-1 rounded shadow-lg flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            <span className="truncate">{validationState.reason || "Cannot place here"}</span>
          </div>
        </div>
      )}
      
      {/* Valid placement indicator */}
      {isCurrentDropTarget && validationState?.valid && (
        <div className="absolute top-1 right-1 z-50 pointer-events-none">
          <div className="bg-green-600 text-white p-1 rounded-full shadow-lg">
            <Check className="w-3 h-3" />
          </div>
        </div>
      )}
    </div>
  );
}

// Visual drag indicator showing where the appointment will be placed
interface DragIndicatorProps {
  time: string;
  duration: number;
  className?: string;
}

export function DragIndicator({ time, duration, className }: DragIndicatorProps) {
  const formatTime12h = (timeStr: string) => {
    const [hour, minute] = timeStr.split(":").map(Number);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minute.toString().padStart(2, "0")} ${ampm}`;
  };

  return (
    <div
      className={cn(
        "absolute inset-x-1 rounded-lg border-2 border-dashed border-[#FF0077]",
        "bg-[#FF0077]/10 flex items-center justify-center",
        "pointer-events-none z-50",
        className
      )}
    >
      <div className="text-center">
        <Clock className="w-4 h-4 text-[#FF0077] mx-auto mb-1" />
        <p className="text-xs font-medium text-[#FF0077]">
          {formatTime12h(time)}
        </p>
        <p className="text-[10px] text-[#FF0077]/70">{duration} min</p>
      </div>
    </div>
  );
}

/**
 * Ghost preview overlay during drag operation
 * Shows a semi-transparent preview of the appointment at the current drop position
 */
interface DragGhostOverlayProps {
  /** Height in pixels per hour */
  hourHeight?: number;
  /** Start hour of the calendar */
  startHour?: number;
}

export function DragGhostOverlay({ 
  hourHeight = 60, 
  startHour = 8 
}: DragGhostOverlayProps) {
  const { isDragging, dragState, dropTarget, validationState, snapTime } = useDragDrop();

  if (!isDragging || !dragState || !dropTarget) {
    return null;
  }

  const appointment = dragState.appointment;
  const displayTime = snapTime || dropTarget.time;
  
  // Calculate position
  const [hour, min] = displayTime.split(":").map(Number);
  const top = ((hour - startHour) * hourHeight) + ((min / 60) * hourHeight);
  const height = Math.max((appointment.duration_minutes / 60) * hourHeight, 36);

  const formatTime12h = (timeStr: string) => {
    const [h, m] = timeStr.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
  };

  const isValid = validationState?.valid ?? true;

  return (
    <div
      className={cn(
        "absolute left-1 right-1 rounded-lg border-2 border-dashed",
        "flex flex-col p-2 pointer-events-none z-40",
        "transition-all duration-75 ease-out",
        isValid
          ? "border-green-500 bg-green-100/80"
          : "border-red-500 bg-red-100/80"
      )}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        opacity: 0.9,
      }}
    >
      <div className="flex items-center justify-between">
        <span className={cn(
          "text-xs font-bold",
          isValid ? "text-green-700" : "text-red-700"
        )}>
          {appointment.client_name}
        </span>
        {isValid ? (
          <Check className="w-4 h-4 text-green-600" />
        ) : (
          <X className="w-4 h-4 text-red-600" />
        )}
      </div>
      <span className={cn(
        "text-[10px]",
        isValid ? "text-green-600" : "text-red-600"
      )}>
        {formatTime12h(displayTime)} • {appointment.duration_minutes}min
      </span>
      {!isValid && validationState?.reason && (
        <span className="text-[9px] text-red-600 mt-1 truncate">
          {validationState.reason}
        </span>
      )}
    </div>
  );
}

/**
 * Snap line indicator showing the time increment boundary
 */
interface SnapLineIndicatorProps {
  /** Height in pixels per hour */
  hourHeight?: number;
  /** Start hour of the calendar */
  startHour?: number;
}

export function SnapLineIndicator({
  hourHeight = 60,
  startHour = 8,
}: SnapLineIndicatorProps) {
  const { isDragging, snapTime } = useDragDrop();

  if (!isDragging || !snapTime) {
    return null;
  }

  const [hour, min] = snapTime.split(":").map(Number);
  const top = ((hour - startHour) * hourHeight) + ((min / 60) * hourHeight);

  return (
    <div
      className="absolute left-0 right-0 h-0.5 bg-[#FF0077] pointer-events-none z-30"
      style={{ top: `${top}px` }}
    >
      <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-[#FF0077]" />
      <div className="absolute left-2 -top-3 text-[10px] font-medium text-[#FF0077] bg-white px-1 rounded shadow">
        {snapTime}
      </div>
    </div>
  );
}
