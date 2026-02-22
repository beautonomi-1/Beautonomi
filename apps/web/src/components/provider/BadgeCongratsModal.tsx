"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Trophy, Sparkles } from "lucide-react";

const STORAGE_KEY = "provider_congrats_badge_seen_at";
const RECENT_DAYS = 7;

interface BadgeCongratsModalProps {
  gamification: {
    current_badge: {
      id: string;
      name: string;
      slug: string;
      color: string | null;
      description: string | null;
    } | null;
    badge_earned_at: string | null;
  } | null;
}

export function BadgeCongratsModal({ gamification }: BadgeCongratsModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!gamification?.current_badge?.id || !gamification.badge_earned_at) return;
    const earnedAt = new Date(gamification.badge_earned_at).getTime();
    const now = Date.now();
    const daysSince = (now - earnedAt) / (24 * 60 * 60 * 1000);
    if (daysSince > RECENT_DAYS) return;

    queueMicrotask(() => {
      try {
        const seen = localStorage.getItem(STORAGE_KEY);
        if (seen === gamification.badge_earned_at) return;
        setOpen(true);
      } catch {
        setOpen(true);
      }
    });
  }, [gamification?.current_badge?.id, gamification?.badge_earned_at]);

  const handleClose = () => {
    try {
      if (gamification?.badge_earned_at) {
        localStorage.setItem(STORAGE_KEY, gamification.badge_earned_at);
      }
    } catch {
      // ignore
    }
    setOpen(false);
  };

  if (!gamification?.current_badge) return null;

  const badge = gamification.current_badge;
  const color = badge.color || "#FFD700";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md text-center">
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${color}20`, border: `3px solid ${color}` }}
            >
              <Trophy className="w-8 h-8" style={{ color }} />
            </div>
          </div>
          <DialogTitle className="flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            Congratulations!
          </DialogTitle>
          <DialogDescription>
            You earned the <strong>{badge.name}</strong> badge.
            {badge.description && (
              <span className="block mt-2 text-sm">{badge.description}</span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button variant="outline" onClick={handleClose}>
            Thanks!
          </Button>
          <Button
            className="bg-[#FF0077] hover:bg-[#FF0077]/90"
            onClick={() => {
              handleClose();
              router.push("/provider/gamification");
            }}
          >
            View rewards
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
