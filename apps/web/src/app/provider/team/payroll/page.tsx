"use client";

import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Plus, ChevronRight, Calendar } from "lucide-react";
import { format, startOfWeek, endOfWeek, subDays } from "date-fns";
import { toast } from "sonner";
import Link from "next/link";
import { fetcher } from "@/lib/http/fetcher";

interface PayRun {
  id: string;
  pay_period_start: string;
  pay_period_end: string;
  status: string;
  created_at: string;
  approved_at?: string;
}

export default function PayrollPage() {
  const [payRuns, setPayRuns] = useState<PayRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState(format(startOfWeek(subDays(new Date(), 7)), "yyyy-MM-dd"));
  const [periodEnd, setPeriodEnd] = useState(format(endOfWeek(subDays(new Date(), 7)), "yyyy-MM-dd"));
  const [periodType, setPeriodType] = useState<"weekly" | "monthly">("weekly");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadPayRuns();
  }, []);

  const loadPayRuns = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: PayRun[] }>("/api/provider/pay-runs");
      setPayRuns(response?.data ?? []);
    } catch (err) {
      console.error("Failed to load pay runs:", err);
      toast.error("Failed to load pay runs");
      setPayRuns([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      setIsCreating(true);
      const res = await fetcher.post<{ data: { id: string } }>("/api/provider/pay-runs", {
        pay_period_start: periodStart,
        pay_period_end: periodEnd,
        period_type: periodType,
      });
      const id = (res as any)?.data?.id ?? (res as any)?.id;
      toast.success("Pay run created");
      setIsCreateOpen(false);
      if (id) window.location.href = `/provider/team/payroll/${id}`;
      else loadPayRuns();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create pay run");
    } finally {
      setIsCreating(false);
    }
  };

  const statusColor = (s: string) => {
    if (s === "draft") return "bg-amber-100 text-amber-800";
    if (s === "approved") return "bg-blue-100 text-blue-800";
    if (s === "paid") return "bg-green-100 text-green-800";
    return "bg-gray-100 text-gray-800";
  };

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6">
      <PageHeader
        title="Payroll"
        subtitle="Manage pay runs and staff payments"
        primaryAction={{
          label: "New Pay Run",
          onClick: () => setIsCreateOpen(true),
          icon: <Plus className="w-4 h-4 mr-2" />,
        }}
      />

      {isLoading ? (
        <SectionCard>
          <Skeleton className="h-48 w-full" />
        </SectionCard>
      ) : payRuns.length === 0 ? (
        <SectionCard className="p-8 text-center">
          <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="font-medium text-gray-900 mb-2">No pay runs yet</h3>
          <p className="text-sm text-gray-600 mb-4">Create your first pay run to get started</p>
          <Button onClick={() => setIsCreateOpen(true)} className="bg-[#FF0077] hover:bg-[#D60565]">
            Create Pay Run
          </Button>
        </SectionCard>
      ) : (
        <SectionCard>
          <div className="divide-y">
            {payRuns.map((pr) => (
              <Link
                key={pr.id}
                href={`/provider/team/payroll/${pr.id}`}
                className="flex items-center justify-between py-4 hover:bg-gray-50 px-2 -mx-2 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="font-medium">
                      {format(new Date(pr.pay_period_start), "MMM d")} – {format(new Date(pr.pay_period_end), "MMM d, yyyy")}
                    </p>
                    <p className="text-xs text-gray-500">Created {format(new Date(pr.created_at), "MMM d, yyyy")}</p>
                  </div>
                  <Badge className={statusColor(pr.status)}>{pr.status}</Badge>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Pay Run</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Period Start</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Period End</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Period Type</Label>
              <select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value as "weekly" | "monthly")}
                className="w-full mt-1 h-10 rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isCreating} className="bg-[#FF0077] hover:bg-[#D60565]">
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
