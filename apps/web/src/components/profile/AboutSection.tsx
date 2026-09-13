"use client";

import { useTranslation } from "@beautonomi/i18n";

import React from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface AboutSectionProps {
  about: string | null;
}

export default function AboutSection({ about }: AboutSectionProps) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/80 border border-white/40 shadow-lg rounded-2xl p-6 md:p-8"
    >
      <h3 className="text-lg font-semibold tracking-tight text-zinc-900 mb-4">
        {t("web.profile.aboutTitle")}
      </h3>
      {about ? (
        <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
          {about}
        </p>
      ) : (
        <div className="text-center py-8">
          <p className="text-sm text-zinc-500 mb-4">
            {t("web.profile.addBio")}
          </p>
          <Link href="/profile/create-profile?highlight=bio">
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-300 hover:bg-zinc-50"
            >
              <Plus className="h-4 w-4 me-2" />
              {t("web.profile.addIntro")}
            </Button>
          </Link>
        </div>
      )}
    </motion.div>
  );
}
