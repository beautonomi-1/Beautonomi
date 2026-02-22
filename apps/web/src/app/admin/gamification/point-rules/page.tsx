"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Award, Save, Loader2 } from "lucide-react";

type PointRule = {
  id: string;
  source: string;
  points: number;
  label: string;
  description: string | null;
  display_order: number;
};

export default function AdminPointRulesPage() {
  const [rules, setRules] = useState<PointRule[]>([]);
  const [editing, setEditing] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    try {
      setIsLoading(true);
      const res = await fetcher.get<{ data: { rules: PointRule[] } }>("/api/admin/gamification/point-rules");
      const list = (res as any)?.data?.rules ?? (res as any)?.rules ?? [];
      setRules(Array.isArray(list) ? list : []);
      setEditing({});
    } catch {
      toast.error("Failed to load point rules");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handlePointsChange = (source: string, value: number) => {
    setEditing((prev) => ({ ...prev, [source]: value }));
  };

  const handleSave = async () => {
    const entries = Object.entries(editing).filter(([, points]) => typeof points === "number");
    if (entries.length === 0) {
      toast.info("No changes to save");
      return;
    }
    try {
      setIsSaving(true);
      await fetcher.patch("/api/admin/gamification/point-rules", {
        rules: entries.map(([source, points]) => ({ source, points })),
      });
      toast.success("Point rules updated");
      await load();
    } catch {
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const getPoints = (r: PointRule) => (editing[r.source] !== undefined ? editing[r.source] : r.points);

  return (
      <div className="container max-w-3xl py-8 px-4">
        <div className="flex items-center gap-3 mb-6">
          <Award className="w-8 h-8 text-amber-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Provider point rules</h1>
            <p className="text-sm text-gray-500">
              Control how many reward points providers earn for each task. Changes apply to new awards only.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {rules.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-4 p-4 rounded-lg border border-gray-200 bg-white"
              >
                <div className="flex-1 min-w-[200px]">
                  <p className="font-medium text-gray-900">{r.label}</p>
                  {r.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{r.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">Source: {r.source}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`pts-${r.source}`} className="text-sm whitespace-nowrap">
                    Points
                  </Label>
                  <Input
                    id={`pts-${r.source}`}
                    type="number"
                    min={0}
                    value={getPoints(r)}
                    onChange={(e) => handlePointsChange(r.source, parseInt(e.target.value, 10) || 0)}
                    className="w-24"
                  />
                </div>
              </div>
            ))}
            <div className="pt-4 flex justify-end">
              <Button onClick={handleSave} disabled={isSaving || Object.keys(editing).length === 0}>
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save changes
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
  );
}
