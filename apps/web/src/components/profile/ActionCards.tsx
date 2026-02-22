"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Shield,
  UserPlus,
  MessageSquare,
  Mail,
  Camera,
  Phone,
  MapPin,
  Heart,
  Sparkles,
} from "lucide-react";
import type { CompletionData } from "@/types/profile";

interface ActionCardsProps {
  topItems: CompletionData["topItems"];
  onItemClick?: (itemId: string) => void;
}

const itemIcons: Record<string, React.ReactNode> = {
  identity: <Shield className="h-5 w-5" />,
  emergency_contact: <UserPlus className="h-5 w-5" />,
  profile_questions: <MessageSquare className="h-5 w-5" />,
  email: <Mail className="h-5 w-5" />,
  photo: <Camera className="h-5 w-5" />,
  phone: <Phone className="h-5 w-5" />,
  address: <MapPin className="h-5 w-5" />,
  bio: <Heart className="h-5 w-5" />,
  interests: <Sparkles className="h-5 w-5" />,
};

const itemColors: Record<string, string> = {
  identity: "from-amber-50 to-orange-50 border-amber-200 text-amber-700",
  emergency_contact: "from-blue-50 to-indigo-50 border-blue-200 text-blue-700",
  profile_questions: "from-purple-50 to-pink-50 border-purple-200 text-purple-700",
  email: "from-emerald-50 to-teal-50 border-emerald-200 text-emerald-700",
  photo: "from-rose-50 to-pink-50 border-rose-200 text-rose-700",
  phone: "from-cyan-50 to-sky-50 border-cyan-200 text-cyan-700",
  address: "from-violet-50 to-purple-50 border-violet-200 text-violet-700",
  bio: "from-fuchsia-50 to-pink-50 border-fuchsia-200 text-fuchsia-700",
  interests: "from-yellow-50 to-amber-50 border-yellow-200 text-yellow-700",
};

export default function ActionCards({ topItems, onItemClick }: ActionCardsProps) {
  if (topItems.length === 0) return null;

  return (
    <div className="space-y-3">
      {topItems.map((item, index) => {
        const icon = itemIcons[item.id] || <Sparkles className="h-5 w-5" />;
        const colorClass = itemColors[item.id] || "from-zinc-50 to-zinc-100 border-zinc-200 text-zinc-700";
        const isUrgent = item.id === "identity";

        return (
          <motion.button
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onItemClick?.(item.id)}
            className={`
              w-full p-4 rounded-xl border-2 transition-all
              bg-gradient-to-br ${colorClass}
              hover:shadow-lg hover:shadow-black/5
              group relative overflow-hidden
            `}
          >
            <div className="relative z-10 flex items-center gap-4">
              <div className={`
                flex-shrink-0 w-12 h-12 rounded-xl
                bg-white/60 backdrop-blur-sm
                flex items-center justify-center
                group-hover:scale-110 transition-transform
                shadow-sm
              `}>
                <div className="text-current">
                  {icon}
                </div>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-current">
                    {item.label}
                  </p>
                  {isUrgent && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                      Soon
                    </span>
                  )}
                </div>
                <p className="text-xs text-current/70">{item.timeEstimate}</p>
              </div>
              <div className="flex-shrink-0">
                <span className="text-current/50 group-hover:text-current transition-colors">
                  →
                </span>
              </div>
            </div>
            {/* Subtle shine effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
          </motion.button>
        );
      })}
    </div>
  );
}
