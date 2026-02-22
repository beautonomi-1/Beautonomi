"use client";

import { useAuth } from "@/providers/AuthProvider";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

/**
 * AuthLoadingSpinner Component
 * 
 * Shows a loading spinner overlay when authentication is being checked.
 * This provides visual feedback during page reloads and auth state changes.
 */
export default function AuthLoadingSpinner() {
  const { isLoading } = useAuth();

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-sm bg-white/80"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="backdrop-blur-2xl bg-white/90 border border-white/40 shadow-2xl rounded-2xl p-8 flex flex-col items-center gap-4"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "linear",
              }}
            >
              <Loader2 className="h-12 w-12 text-[#FF0077]" strokeWidth={2.5} />
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-sm font-medium text-gray-700 tracking-tight"
            >
              Checking authentication...
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
