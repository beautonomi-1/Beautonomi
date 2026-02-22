"use client";

import React from "react";
import { motion } from "framer-motion";
import type { CompletionData } from "@/types/profile";

interface FloatingProgressOrbitProps {
  completionData: CompletionData;
  onCompleteClick?: () => void;
  onItemClick?: (itemId: string) => void;
}

export default function FloatingProgressOrbit({
  completionData,
  onCompleteClick,
  onItemClick,
}: FloatingProgressOrbitProps) {
  const { percentage, topItems } = completionData;
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  // Gradient colors based on percentage
  const getGradientColor = () => {
    if (percentage < 30) return "#ef4444"; // red
    if (percentage < 60) return "#f59e0b"; // amber
    if (percentage < 90) return "#3b82f6"; // blue
    return "#10b981"; // emerald
  };

  const gradientColor = getGradientColor();

  return (
    <div className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8">
      <div className="flex flex-col md:flex-row gap-6 md:gap-8">
        {/* Progress Ring */}
        <div className="flex-shrink-0 flex items-center justify-center">
          <div className="relative">
            <svg
              className="transform -rotate-90 w-32 h-32 md:w-40 md:h-40"
              viewBox="0 0 120 120"
            >
              {/* Background circle */}
              <circle
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-zinc-200"
              />
              {/* Progress circle */}
              <motion.circle
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={gradientColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="drop-shadow-sm"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl md:text-3xl font-bold text-zinc-900">{percentage}%</span>
              <span className="text-xs text-zinc-500 mt-1">Complete</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="mb-4">
            <h3 className="text-lg font-semibold tracking-tight text-zinc-900 mb-1">
              Profile Strength
            </h3>
            <p className="text-sm text-zinc-600">
              {completionData.completed} of {completionData.total} completed
            </p>
          </div>

          {percentage < 100 && (
            <>
              <div className="mb-4">
                <p className="text-xs font-semibold text-zinc-700 mb-3">
                  Level up your profile
                </p>
                <div className="space-y-2">
                  {topItems.map((item, index) => (
                    <motion.button
                      key={item.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      whileHover={{ scale: 1.02, x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onItemClick?.(item.id)}
                      className="w-full text-left p-3 rounded-xl bg-gradient-to-r from-zinc-50 to-white border border-zinc-200/50 hover:border-zinc-300 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-100 group-hover:bg-zinc-200 flex items-center justify-center transition-colors">
                            <span className="text-xs font-semibold text-zinc-600">
                              {index + 1}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-900 truncate">
                              {item.label}
                            </p>
                            <p className="text-xs text-zinc-500">{item.timeEstimate}</p>
                          </div>
                        </div>
                        <span className="text-xs font-medium text-zinc-400 group-hover:text-zinc-600 ml-2 flex-shrink-0">
                          →
                        </span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onCompleteClick}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF0077] to-[#E6006A] text-white font-medium shadow-lg hover:shadow-xl transition-all"
              >
                Complete profile
              </motion.button>
            </>
          )}

          {percentage === 100 && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-sm font-medium text-emerald-800">
                🎉 Your profile is complete!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
