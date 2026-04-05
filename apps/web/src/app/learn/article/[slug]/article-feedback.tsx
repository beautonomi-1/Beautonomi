"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";

export default function ArticleFeedback({ slug }: { slug: string }) {
  const [feedbackSent, setFeedbackSent] = useState<boolean | null>(null);

  const sendFeedback = async (helpful: boolean) => {
    if (feedbackSent !== null) return;
    try {
      await fetch(`/api/public/learn/article/${encodeURIComponent(slug)}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ helpful }),
      });
      setFeedbackSent(helpful);
    } catch {
      setFeedbackSent(false);
    }
  };

  return (
    <section className="pt-6 border-t border-zinc-200/50">
      <p className="text-sm font-medium text-black mb-2">Was this helpful?</p>
      <div className="flex gap-2 flex-wrap items-center">
        <motion.div whileTap={{ scale: 1.05 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
          <Button
            variant={feedbackSent === true ? "default" : "outline"}
            size="sm"
            className={
              feedbackSent === true
                ? "bg-[#ff0077] hover:bg-[#ff0077]/90"
                : "border-zinc-200/50 active:scale-[1.02]"
            }
            onClick={() => sendFeedback(true)}
            disabled={feedbackSent !== null}
          >
            <ThumbsUp className="h-4 w-4 mr-1" />
            Yes
          </Button>
        </motion.div>
        <motion.div whileTap={{ scale: 1.05 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
          <Button
            variant={feedbackSent === false ? "secondary" : "outline"}
            size="sm"
            className="border-zinc-200/50 active:scale-[1.02]"
            onClick={() => sendFeedback(false)}
            disabled={feedbackSent !== null}
          >
            <ThumbsDown className="h-4 w-4 mr-1" />
            No
          </Button>
        </motion.div>
        {feedbackSent !== null && (
          <motion.div
            className="flex items-center gap-2 text-zinc-600"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-600">
              <Check className="h-4 w-4" />
            </span>
            <span className="text-xs">Thanks for your feedback.</span>
          </motion.div>
        )}
      </div>
    </section>
  );
}
