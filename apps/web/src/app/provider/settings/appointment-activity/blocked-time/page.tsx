"use client";

import React, { useEffect, useMemo, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";

type AvailabilityBlock = {
  id: string;
  block_type: "unavailable" | "break" | "maintenance";
  start_at: string;
  end_at: string;
  reason?: string | null;
};

export default function BlockedTimeTypesSettings() {
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [blockType, setBlockType] = useState<AvailabilityBlock["block_type"]>("break");
  const [startAt, setStartAt] = useState<string>("");
  const [endAt, setEndAt] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 14);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetcher.get<{ data: AvailabilityBlock[] }>(
        `/api/provider/availability-blocks?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
      );
      setBlocks((res.data || []).filter((b) => b.block_type !== "unavailable"));
    } catch (error: any) {
      console.error("Error loading blocks:", error);
      const errorMessage = error instanceof FetchError 
        ? error.message 
        : error?.error?.message || "Failed to load blocked time";
      setError(errorMessage);
      setBlocks([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createBlock = async () => {
    try {
      setIsSaving(true);
      if (!startAt || !endAt) {
        toast.error("Start and end date/time are required");
        return;
      }

      // Convert datetime-local format to ISO string
      // datetime-local format: "2024-01-15T14:30"
      // Need to convert to ISO: "2024-01-15T14:30:00.000Z"
      const startDate = new Date(startAt);
      const endDate = new Date(endAt);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        toast.error("Invalid date/time format");
        return;
      }

      if (endDate <= startDate) {
        toast.error("End time must be after start time");
        return;
      }

      await fetcher.post("/api/provider/availability-blocks", {
        block_type: blockType,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        reason: reason || null,
      });
      setStartAt("");
      setEndAt("");
      setReason("");
      toast.success("Blocked time added successfully");
      await load();
    } catch (e: any) {
      const errorMessage = e?.message || e?.error?.message || "Failed to add blocked time";
      toast.error(errorMessage);
      console.error("Error creating block:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteBlock = async (id: string) => {
    if (!confirm("Are you sure you want to remove this blocked time?")) {
      return;
    }

    try {
      await fetcher.delete(`/api/provider/availability-blocks/${id}`);
      toast.success("Blocked time removed successfully");
      await load();
    } catch (e: any) {
      const errorMessage = e instanceof FetchError 
        ? e.message 
        : e?.error?.message || "Failed to remove blocked time";
      toast.error(errorMessage);
      console.error("Error deleting block:", e);
    }
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Blocked Time" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Blocked Time"
        subtitle="Add breaks and maintenance blocks (these will remove availability)"
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage="Loading blocked time..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Blocked Time"
      subtitle="Add breaks and maintenance blocks (these will remove availability)"
      onSave={createBlock}
      isSaving={isSaving}
      breadcrumbs={breadcrumbs}
    >
      <SectionCard>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={blockType} onValueChange={(v) => setBlockType(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="break">Break</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lunch / Training / Meeting" />
          </div>
          <div className="space-y-2">
            <Label>Start</Label>
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>End</Label>
            <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Button onClick={createBlock} disabled={isSaving}>
              Add Block
            </Button>
          </div>
        </div>
      </SectionCard>

      {error && (
        <SectionCard>
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
            {error}
          </div>
        </SectionCard>
      )}

      <SectionCard>
        <div className="space-y-3">
          <div className="text-sm text-gray-600">Upcoming blocked time (next 14 days)</div>
          {blocks.length === 0 ? (
            <EmptyState
              title="No blocked time"
              description="Add breaks or maintenance blocks to prevent bookings during those times."
            />
          ) : (
            <div className="space-y-2">
              {blocks.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded border p-3 hover:bg-gray-50 transition-colors">
                  <div className="space-y-1 flex-1">
                    <div className="text-sm font-medium">
                      {new Date(b.start_at).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })} → {new Date(b.end_at).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                    <div className="text-sm text-gray-600 capitalize">
                      {b.block_type}
                      {b.reason ? ` • ${b.reason}` : ""}
                    </div>
                  </div>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => deleteBlock(b.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
