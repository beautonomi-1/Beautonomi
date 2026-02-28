"use client";

import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Props = {
  providerId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function RequestCustomServiceDialog({ providerId, isOpen, onOpenChange }: Props) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [budgetMin, setBudgetMin] = useState<string>("");
  const [budgetMax, setBudgetMax] = useState<string>("");
  const [preferredStartAt, setPreferredStartAt] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [imageUrlsText, setImageUrlsText] = useState<string>("");
  const [locationType, setLocationType] = useState<"at_home" | "at_salon">("at_salon");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const imageUrls = useMemo(() => {
    return imageUrlsText
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
  }, [imageUrlsText]);

  const submit = async () => {
    try {
      setIsSubmitting(true);
      const res = await fetcher.post<{ data: any }>("/api/me/custom-requests", {
        provider_id: providerId,
        description,
        budget_min: budgetMin ? Number(budgetMin) : null,
        budget_max: budgetMax ? Number(budgetMax) : null,
        preferred_start_at: preferredStartAt || null,
        duration_minutes: Number(durationMinutes || 60),
        image_urls: imageUrls,
        location_type: locationType,
      });
      toast.success("Custom request sent");
      onOpenChange(false);
      router.push("/account-settings/custom-requests");
      return res.data;
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to send request");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Request Custom Service</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you want, what occasion it's for, preferred style, etc."
              rows={5}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Budget Min</Label>
              <Input value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} type="number" min={0} />
            </div>
            <div className="space-y-2">
              <Label>Budget Max</Label>
              <Input value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} type="number" min={0} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Preferred Date/Time</Label>
              <Input value={preferredStartAt} onChange={(e) => setPreferredStartAt(e.target.value)} type="datetime-local" />
            </div>
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                type="number"
                min={15}
                step={15}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Inspiration photo URLs (optional)</Label>
            <Textarea
              value={imageUrlsText}
              onChange={(e) => setImageUrlsText(e.target.value)}
              placeholder="Paste up to 6 image URLs (comma or newline separated)"
              rows={3}
            />
            <p className="text-xs text-gray-600">Upload support can be added later; for now we store URLs.</p>
          </div>

          <div className="flex gap-2">
            <Button
              variant={locationType === "at_salon" ? "default" : "outline"}
              onClick={() => setLocationType("at_salon")}
              type="button"
            >
              At Salon
            </Button>
            <Button
              variant={locationType === "at_home" ? "default" : "outline"}
              onClick={() => setLocationType("at_home")}
              type="button"
            >
              At home
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={isSubmitting || description.trim().length < 10}>
              {isSubmitting ? "Sending..." : "Send Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
