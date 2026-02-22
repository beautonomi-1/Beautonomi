"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, CreditCard, ArrowRight, CheckCircle2, Plus } from "lucide-react";
import Image from "next/image";
import Visa from "./../../../../../public/images/logo_visa.0adea522bb26bd90821a8fade4911913.svg";
import MasterCard from "./../../../../../public/images/logo_mastercard.f18379cf1f27d22abd9e9cf44085d149.svg";
import Discover from "./../../../../../public/images/logo_discover.7f05c82f07d62a0f8a69d54dbcd7c8be.svg";
import Amex from "./../../../../../public/images/logo_amex.84088b520ca1b3384cb71398095627da.svg";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

const SAVE_CARD_INFO =
  "We'll save your card securely when you pay. To verify your card, Paystack may place a small temporary charge (e.g. R1) and reverse it—this confirms your card for future use.";

const AddPaymentModal = ({ isOpen, onClose, onCardAdded }: { isOpen: boolean; onClose: () => void; onCardAdded?: () => void }) => {
  const [addingCard, setAddingCard] = useState(false);

  const handleAddCardNow = async () => {
    setAddingCard(true);
    try {
      const res = await fetcher.post<{ data?: { authorization_url?: string }; error?: { message?: string } }>(
        "/api/me/payment-methods/initialize-verification",
        { set_as_default: false }
      );
      const url = res?.data?.authorization_url;
      if (!url) {
        toast.error((res as any)?.error?.message || "Could not start card verification");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
      toast.info("Complete verification in the new tab, then refresh this page.");
      onClose();
      onCardAdded?.();
    } catch (err: any) {
      toast.error(err?.message || "Could not add card");
    } finally {
      setAddingCard(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="backdrop-blur-2xl bg-white/90 border border-white/40 shadow-2xl rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold tracking-tighter text-gray-900">
                Add Payment Method
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Info Banner */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl"
            >
              <div className="flex items-start gap-3">
                <CreditCard className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-900 mb-2">
                    Add or save a card
                  </p>
                  <p className="text-sm text-blue-700">
                    {SAVE_CARD_INFO}
                  </p>
                  <p className="text-sm text-blue-700 mt-2">
                    You can also save a card during checkout by selecting &quot;Save this card for future payments&quot;.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* How it works */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold tracking-tighter mb-4 text-gray-900">
                How to save a payment method:
              </h3>
              <ol className="space-y-3">
                {[
                  "Book a service with a provider",
                  "Proceed to checkout and payment",
                  "Pay securely with Paystack",
                  "Select 'Save this card for future payments'",
                  "Your card will be saved for future bookings"
                ].map((step, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + index * 0.1 }}
                    className="flex items-start gap-3 text-sm text-gray-700"
                  >
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-[#FF0077] to-[#E6006A] text-white flex items-center justify-center text-xs font-semibold">
                      {index + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </motion.li>
                ))}
              </ol>
            </div>

            {/* Supported Cards */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-3">Supported payment methods:</p>
              <div className="flex gap-4">
                <Image src={Visa} alt="Visa" className="h-8 w-auto" />
                <Image src={MasterCard} alt="MasterCard" className="h-8 w-auto" />
                <Image src={Discover} alt="Discover" className="h-8 w-auto" />
                <Image src={Amex} alt="American Express" className="h-8 w-auto" />
              </div>
            </div>

            {/* Security Note */}
            <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-green-800">
                  <strong>Secure:</strong> All payment information is encrypted and processed securely through Paystack. 
                  We never store your full card details.
                </p>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col gap-3">
              <motion.button
                type="button"
                onClick={handleAddCardNow}
                disabled={addingCard}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {addingCard ? (
                  <span>Opening...</span>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add card now
                  </>
                )}
              </motion.button>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/" className="flex-1">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full border-2 border-[#FF0077] text-[#FF0077] hover:bg-pink-50 px-6 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    Browse Services
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </Link>
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 border-gray-300 hover:bg-gray-50"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AddPaymentModal;
