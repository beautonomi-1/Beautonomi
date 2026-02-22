"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface TourStep {
  id: string;
  title: string;
  description: string;
  targetSelector: string; // CSS selector for the element to highlight
  position?: "top" | "bottom" | "left" | "right";
}

interface OnboardingTourProps {
  steps: TourStep[];
  storageKey: string; // localStorage key to track if tour was completed
  onComplete?: () => void;
}

export function OnboardingTour({ steps, storageKey, onComplete }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check if tour was already completed
    const completed = localStorage.getItem(storageKey);
    if (!completed && steps.length > 0) {
      setIsVisible(true);
      highlightStep(0);
    }
  }, [storageKey, steps.length]);

  const highlightStep = (stepIndex: number) => {
    if (stepIndex >= steps.length) {
      completeTour();
      return;
    }

    const step = steps[stepIndex];
    const element = document.querySelector(step.targetSelector) as HTMLElement;
    
    if (element) {
      setTargetElement(element);
      // Scroll element into view
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      
      // Wait for scroll to complete
      setTimeout(() => {
        setCurrentStep(stepIndex);
      }, 500);
    } else {
      // Element not found, skip to next step
      if (stepIndex < steps.length - 1) {
        highlightStep(stepIndex + 1);
      } else {
        completeTour();
      }
    }
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      highlightStep(currentStep + 1);
    } else {
      completeTour();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      highlightStep(currentStep - 1);
    }
  };

  const skipTour = () => {
    completeTour();
  };

  const completeTour = () => {
    localStorage.setItem(storageKey, "completed");
    setIsVisible(false);
    setTargetElement(null);
    if (onComplete) {
      onComplete();
    }
  };

  if (!isVisible || currentStep >= steps.length) {
    return null;
  }

  const step = steps[currentStep];
  const position = step.position || "bottom";

  // Calculate position for tooltip
  const getTooltipStyle = () => {
    if (!targetElement) return {};

    const rect = targetElement.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    switch (position) {
      case "top":
        return {
          top: rect.top + scrollY - 10,
          left: rect.left + scrollX + rect.width / 2,
          transform: "translate(-50%, -100%)",
        };
      case "bottom":
        return {
          top: rect.bottom + scrollY + 10,
          left: rect.left + scrollX + rect.width / 2,
          transform: "translateX(-50%)",
        };
      case "left":
        return {
          top: rect.top + scrollY + rect.height / 2,
          left: rect.left + scrollX - 10,
          transform: "translate(-100%, -50%)",
        };
      case "right":
        return {
          top: rect.top + scrollY + rect.height / 2,
          left: rect.right + scrollX + 10,
          transform: "translateY(-50%)",
        };
      default:
        return {};
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 bg-black bg-opacity-50 z-[9998]"
        onClick={skipTour}
      />

      {/* Highlight */}
      {targetElement && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: targetElement.getBoundingClientRect().top + window.scrollY - 4,
            left: targetElement.getBoundingClientRect().left + window.scrollX - 4,
            width: targetElement.getBoundingClientRect().width + 8,
            height: targetElement.getBoundingClientRect().height + 8,
            border: "3px solid #FF0077",
            borderRadius: "8px",
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
          }}
        />
      )}

      {/* Tooltip */}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="fixed z-[10000] bg-white rounded-lg shadow-2xl p-6 max-w-sm pointer-events-auto"
          style={getTooltipStyle()}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#FF0077]" />
              <span className="text-xs font-medium text-gray-500">
                Step {currentStep + 1} of {steps.length}
              </span>
            </div>
            <button
              onClick={skipTour}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
          <p className="text-sm text-gray-600 mb-4">{step.description}</p>

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {currentStep > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={prevStep}
                  className="text-sm"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={skipTour}
                className="text-sm"
              >
                Skip Tour
              </Button>
              <Button
                size="sm"
                onClick={nextStep}
                className="bg-[#FF0077] hover:bg-[#D60565] text-white text-sm"
              >
                {currentStep === steps.length - 1 ? "Finish" : "Next"}
                {currentStep < steps.length - 1 && (
                  <ChevronRight className="w-4 h-4 ml-1" />
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
