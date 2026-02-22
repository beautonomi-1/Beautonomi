"use client";

import React from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface AboutSectionProps {
  about: string | null;
}

export default function AboutSection({ about }: AboutSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
    >
      <h3 className="text-lg font-semibold tracking-tight text-zinc-900 mb-4">
        About
      </h3>
      {about ? (
        <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
          {about}
        </p>
      ) : (
        <div className="text-center py-8">
          <p className="text-sm text-zinc-500 mb-4">
            Add a bio to tell providers about yourself
          </p>
          <Link href="/profile/create-profile">
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-300 hover:bg-zinc-50"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add intro
            </Button>
          </Link>
        </div>
      )}
    </motion.div>
  );
}
