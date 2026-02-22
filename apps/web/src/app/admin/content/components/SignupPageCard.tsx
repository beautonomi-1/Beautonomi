"use client";

import React from "react";
import { motion } from "framer-motion";
import { Edit, Trash2 } from "lucide-react";

/** Accepts PageContent (order) or SignupPageContent (display_order) */
interface SignupPageContent {
  id: string;
  section_key: string;
  content_type: string;
  content: string;
  display_order?: number;
  order?: number;
  is_active: boolean;
}

const getDisplayOrder = (c: SignupPageContent) => c.display_order ?? c.order ?? 0;

interface SignupPageCardProps {
  content: SignupPageContent;
  onEdit: () => void;
  onDelete: () => void;
}

export function SignupPageCard({ content, onEdit, onDelete }: SignupPageCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition-all"
    >
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base sm:text-lg text-gray-900 dark:text-white mb-2">
            {content.section_key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            Type: <span className="capitalize font-medium">{content.content_type}</span>
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 leading-relaxed">
            {content.content.length > 150 ? `${content.content.substring(0, 150)}...` : content.content}
          </p>
        </div>
        <div className="flex gap-2 sm:ml-4 flex-shrink-0">
          <motion.button
            onClick={onEdit}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 text-gray-600 hover:text-[#FF0077] hover:bg-pink-50 rounded-lg transition-colors"
            aria-label="Edit content"
          >
            <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
          <motion.button
            onClick={onDelete}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            aria-label="Delete content"
          >
            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-3 border-t border-gray-200">
        <span className="text-xs font-medium text-gray-700">Order: {getDisplayOrder(content)}</span>
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold w-fit ${
            content.is_active
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {content.is_active ? "Active" : "Inactive"}
        </span>
      </div>
    </motion.div>
  );
}
