"use client";

/**
 * Time Block Sidebar
 * 
 * Sidebar panel for creating and editing time blocks.
 * Supports block types (break, lunch, meeting, custom) and repeating patterns.
 * 
 * @module components/calendar/TimeBlockSidebar
 */

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  X,
  Coffee,
  Utensils,
  Users,
  User,
  Car,
  Ban,
  Calendar as CalendarIcon,
  Clock,
  Repeat,
  Trash2,
  Edit3,
  Save,
  ChevronLeft,
} from "lucide-react";

import {
  useTimeBlockSidebar,
  closeBlockSidebar,
  switchBlockToEditMode,
  switchBlockToViewMode,
  updateBlockDraft,
  setBlockSaving,
  createRecurrenceRuleFromDraft,
  type BlockType,
  BLOCK_TYPE_CONFIG,
} from "@/stores/time-block-sidebar-store";
import type { TeamMember, TimeBlock } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";

// ============================================================================
// PROPS
// ============================================================================

interface TimeBlockSidebarProps {
  teamMembers: TeamMember[];
  onBlockCreated?: (block: TimeBlock) => void;
  onBlockUpdated?: (block: TimeBlock) => void;
  onBlockDeleted?: (blockId: string) => void;
  // Alias props for compatibility
  onTimeBlockCreated?: (block: TimeBlock) => void;
  onTimeBlockUpdated?: (block: TimeBlock) => void;
  onTimeBlockDeleted?: (blockId: string) => void;
  onRefresh?: () => void;
}

// ============================================================================
// ICONS
// ============================================================================

const BlockTypeIcon: React.FC<{ type: BlockType; className?: string }> = ({ type, className }) => {
  const icons: Record<BlockType, React.ReactNode> = {
    break: <Coffee className={className} />,
    lunch: <Utensils className={className} />,
    meeting: <Users className={className} />,
    personal: <User className={className} />,
    travel: <Car className={className} />,
    custom: <Ban className={className} />,
  };
  return <>{icons[type]}</>;
};

// ============================================================================
// WEEKDAY SELECTOR
// ============================================================================

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

interface WeekdaySelectorProps {
  selected: number[];
  onChange: (days: number[]) => void;
}

const WeekdaySelector: React.FC<WeekdaySelectorProps> = ({ selected, onChange }) => {
  const toggleDay = (day: number) => {
    if (selected.includes(day)) {
      onChange(selected.filter(d => d !== day));
    } else {
      onChange([...selected, day].sort());
    }
  };

  return (
    <div className="flex gap-1">
      {WEEKDAYS.map(day => (
        <button
          key={day.value}
          type="button"
          onClick={() => toggleDay(day.value)}
          className={cn(
            "w-9 h-9 rounded-full text-xs font-medium transition-colors",
            selected.includes(day.value)
              ? "bg-[#FF0077] text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          )}
        >
          {day.label}
        </button>
      ))}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TimeBlockSidebar({
  teamMembers,
  onBlockCreated,
  onBlockUpdated,
  onBlockDeleted,
  onTimeBlockCreated,
  onTimeBlockUpdated,
  onTimeBlockDeleted,
  onRefresh,
}: TimeBlockSidebarProps) {
  // Use either prop name for callbacks
  const handleBlockCreated = onBlockCreated || onTimeBlockCreated;
  const handleBlockUpdated = onBlockUpdated || onTimeBlockUpdated;
  const handleBlockDeleted = onBlockDeleted || onTimeBlockDeleted;
  const {
    mode,
    selectedBlock,
    draft,
    isLoading: _isLoading,
    isSaving,
    isOpen,
  } = useTimeBlockSidebar();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Don't render if not open
  if (!isOpen) return null;

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleClose = () => {
    closeBlockSidebar();
  };

  const handleSave = async () => {
    if (!draft) return;

    // Validate
    if (!draft.staffId) {
      toast.error("Please select a team member");
      return;
    }
    if (!draft.startTime || !draft.endTime) {
      toast.error("Please select start and end times");
      return;
    }
    if (draft.startTime >= draft.endTime) {
      toast.error("End time must be after start time");
      return;
    }

    setBlockSaving(true);
    try {
      const blockData: Partial<TimeBlock> = {
        name: draft.name || BLOCK_TYPE_CONFIG[draft.blockType].label,
        description: draft.description,
        team_member_id: draft.staffId,
        team_member_name: draft.staffName || teamMembers.find(m => m.id === draft.staffId)?.name,
        date: draft.date,
        start_time: draft.startTime,
        end_time: draft.endTime,
        is_recurring: draft.isRepeating,
        is_active: true,
      };

      // Add recurrence rule if repeating
      if (draft.isRepeating && draft.repeatDays && draft.repeatDays.length > 0) {
        blockData.recurrence_rule = createRecurrenceRuleFromDraft(draft);
      }

      if (mode === "create") {
        const created = await providerApi.createTimeBlock(blockData);
        toast.success("Time block created");
        handleBlockCreated?.(created);
        closeBlockSidebar();
      } else if (mode === "edit" && selectedBlock) {
        const updated = await providerApi.updateTimeBlock(selectedBlock.id, blockData);
        toast.success("Time block updated");
        handleBlockUpdated?.(updated);
        closeBlockSidebar();
      }

      onRefresh?.();
    } catch (error) {
      console.error("Failed to save time block:", error);
      toast.error("Failed to save time block");
    } finally {
      setBlockSaving(false);
    }
  };

  const handleDeleteBlock = async () => {
    if (!selectedBlock) return;

    setBlockSaving(true);
    try {
      await providerApi.deleteTimeBlock(selectedBlock.id);
      toast.success("Time block deleted");
      handleBlockDeleted?.(selectedBlock.id);
      closeBlockSidebar();
      onRefresh?.();
    } catch (error) {
      console.error("Failed to delete time block:", error);
      toast.error("Failed to delete time block");
    } finally {
      setBlockSaving(false);
      setShowDeleteDialog(false);
    }
  };

  // ============================================================================
  // RENDER: VIEW MODE
  // ============================================================================

  if (mode === "view" && selectedBlock) {
    const blockType = inferBlockTypeFromName(selectedBlock.name || "");
    const config = BLOCK_TYPE_CONFIG[blockType];

    return (
      <div className="w-full sm:w-[380px] sm:max-w-[380px] flex flex-col flex-shrink-0 bg-white border-l border-gray-200 shadow-lg h-full overflow-x-hidden overflow-y-auto box-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white flex-shrink-0 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: config.bgColor }}
            >
              <span style={{ color: config.color }}>
                <BlockTypeIcon type={blockType} className="w-5 h-5" />
              </span>
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">{selectedBlock.name || "Time Block"}</h2>
              <p className="text-xs text-gray-500">{config.label}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 w-full max-w-full">
          <div className="p-4 space-y-4 w-full max-w-full overflow-x-hidden">
            {/* Date & Time */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Date & Time
              </Label>
              <div className="flex items-center gap-2 text-sm">
                <CalendarIcon className="w-4 h-4 text-gray-400" />
                <span>{format(new Date(selectedBlock.date), "EEEE, MMMM d, yyyy")}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                <span>{selectedBlock.start_time} - {selectedBlock.end_time}</span>
              </div>
            </div>

            {/* Staff */}
            {selectedBlock.team_member_name && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Staff
                </Label>
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-gray-400" />
                  <span>{selectedBlock.team_member_name}</span>
                </div>
              </div>
            )}

            {/* Repeating */}
            {selectedBlock.is_recurring && selectedBlock.recurrence_rule && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Repeating
                </Label>
                <div className="flex items-center gap-2 text-sm">
                  <Repeat className="w-4 h-4 text-gray-400" />
                  <span>
                    Weekly on{" "}
                    {selectedBlock.recurrence_rule.days_of_week
                      ?.map(d => WEEKDAYS[d].label)
                      .join(", ")}
                  </span>
                </div>
              </div>
            )}

            {/* Description */}
            {selectedBlock.description && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Notes
                </Label>
                <p className="text-sm text-gray-600">{selectedBlock.description}</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t bg-white flex-shrink-0 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => switchBlockToEditMode()}
          >
            <Edit3 className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button
            variant="outline"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Delete Confirmation */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Time Block?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this time block. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteBlock}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ============================================================================
  // RENDER: CREATE/EDIT MODE
  // ============================================================================

  if ((mode === "create" || mode === "edit") && draft) {
    return (
      <div className="w-full sm:w-[380px] sm:max-w-[380px] flex flex-col flex-shrink-0 bg-white border-l border-gray-200 shadow-lg h-full overflow-x-hidden overflow-y-auto box-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white flex-shrink-0 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {mode === "edit" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => switchBlockToViewMode()}
                className="h-8 w-8"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}
            <h2 className="font-semibold text-gray-900">
              {mode === "create" ? "New Time Block" : "Edit Time Block"}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 w-full max-w-full">
          <div className="p-4 space-y-5 w-full max-w-full overflow-x-hidden">
            {/* Block Type */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Block Type
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(BLOCK_TYPE_CONFIG) as BlockType[]).map(type => {
                  const config = BLOCK_TYPE_CONFIG[type];
                  const isSelected = draft.blockType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => updateBlockDraft({ blockType: type })}
                      className={cn(
                        "flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors",
                        isSelected
                          ? "border-[#FF0077] bg-[#FF0077]/5"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <BlockTypeIcon
                        type={type}
                        className={cn(
                          "w-5 h-5",
                          isSelected ? "text-[#FF0077]" : "text-gray-500"
                        )}
                      />
                      <span className={cn(
                        "text-xs font-medium",
                        isSelected ? "text-[#FF0077]" : "text-gray-600"
                      )}>
                        {config.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Name (optional)
              </Label>
              <Input
                value={draft.name || ""}
                onChange={(e) => updateBlockDraft({ name: e.target.value })}
                placeholder={BLOCK_TYPE_CONFIG[draft.blockType].label}
              />
            </div>

            {/* Staff */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Team Member
              </Label>
              <Select
                value={draft.staffId}
                onValueChange={(value) => {
                  const member = teamMembers.find(m => m.id === value);
                  updateBlockDraft({ staffId: value, staffName: member?.name });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map(member => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Date
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {draft.date
                      ? format(new Date(draft.date), "PPP")
                      : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={draft.date ? new Date(draft.date) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        updateBlockDraft({ date: format(date, "yyyy-MM-dd") });
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Time
              </Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="time"
                  value={draft.startTime}
                  onChange={(e) => updateBlockDraft({ startTime: e.target.value })}
                  className="flex-1"
                />
                <span className="text-gray-400">to</span>
                <Input
                  type="time"
                  value={draft.endTime}
                  onChange={(e) => updateBlockDraft({ endTime: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>

            {/* Repeating */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Repeat Weekly
                </Label>
                <Switch
                  checked={draft.isRepeating}
                  onCheckedChange={(checked) => updateBlockDraft({ isRepeating: checked })}
                />
              </div>
              
              {draft.isRepeating && (
                <div className="space-y-3 pl-0">
                  <WeekdaySelector
                    selected={draft.repeatDays || []}
                    onChange={(days) => updateBlockDraft({ repeatDays: days })}
                  />
                  
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500">Repeat until (optional)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {draft.repeatUntil
                            ? format(new Date(draft.repeatUntil), "PPP")
                            : "No end date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={draft.repeatUntil ? new Date(draft.repeatUntil) : undefined}
                          onSelect={(date) => {
                            updateBlockDraft({
                              repeatUntil: date ? format(date, "yyyy-MM-dd") : undefined,
                            });
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Notes (optional)
              </Label>
              <Textarea
                value={draft.description || ""}
                onChange={(e) => updateBlockDraft({ description: e.target.value })}
                placeholder="Add any notes..."
                rows={3}
              />
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t bg-white flex-shrink-0 flex gap-2">
          <Button variant="outline" onClick={handleClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 bg-[#FF0077] hover:bg-[#D60565]"
          >
            {isSaving ? (
              "Saving..."
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {mode === "create" ? "Create Block" : "Save Changes"}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

// ============================================================================
// HELPERS
// ============================================================================

function inferBlockTypeFromName(name: string): BlockType {
  const lower = name.toLowerCase();
  if (lower.includes("lunch")) return "lunch";
  if (lower.includes("break")) return "break";
  if (lower.includes("meeting")) return "meeting";
  if (lower.includes("personal")) return "personal";
  if (lower.includes("travel")) return "travel";
  return "custom";
}

export default TimeBlockSidebar;
