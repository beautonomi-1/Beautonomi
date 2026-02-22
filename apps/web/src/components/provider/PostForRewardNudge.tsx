"use client";

import React from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Gift, ImageIcon } from "lucide-react";

interface PostForRewardNudgeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PostForRewardNudge({ open, onOpenChange }: PostForRewardNudgeProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-amber-500" />
            Earn reward points
          </DialogTitle>
          <DialogDescription>
            Share your work on Explore and earn reward points. Post a photo or story from today’s booking to grow your visibility and unlock rewards.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Button asChild className="bg-[#FF0077] hover:bg-[#FF0077]/90 text-white">
            <Link href="/provider/explore/new" onClick={() => onOpenChange(false)}>
              <ImageIcon className="w-4 h-4 mr-2" />
              Post to Explore
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
