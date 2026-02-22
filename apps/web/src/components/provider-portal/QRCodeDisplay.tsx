"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Download, RefreshCw, QrCode, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { generateQRCodeDataURL, type QRCodeData } from "@/lib/qr/generator";

interface QRCodeDisplayProps {
  qrData: QRCodeData;
  onRefresh?: () => void;
  title?: string;
  description?: string;
}

export function QRCodeDisplay({
  qrData,
  onRefresh,
  title = "Verification QR Code",
  description = "Customer can scan this code to verify your arrival",
}: QRCodeDisplayProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    generateQR();
  }, [qrData]);

  const generateQR = async () => {
    try {
      setIsGenerating(true);
      const dataURL = await generateQRCodeDataURL(qrData);
      setQrCodeUrl(dataURL);
    } catch (error) {
      console.error("Failed to generate QR code:", error);
      toast.error("Failed to generate QR code");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!qrCodeUrl) return;
    const link = document.createElement("a");
    link.href = qrCodeUrl;
    link.download = `qr-code-${qrData.booking_number}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("QR code downloaded");
  };

  const handleCopyImage = async () => {
    if (!qrCodeUrl) return;
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast.success("QR code copied to clipboard");
    } catch (error) {
      console.error("Failed to copy QR code:", error);
      toast.error("Failed to copy QR code");
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(qrData.verification_code);
    toast.success("Verification code copied");
  };

  if (isGenerating) {
    return (
      <div className="flex items-center justify-center p-8 sm:p-12 bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl border-2 border-dashed border-gray-300">
        <div className="text-center">
          <div className="relative w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4">
            <RefreshCw className="w-full h-full animate-spin text-[#FF0077]" />
            <div className="absolute inset-0 rounded-full border-2 border-[#FF0077]/20"></div>
          </div>
          <p className="text-sm sm:text-base font-medium text-gray-700">Generating QR code...</p>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Please wait</p>
        </div>
      </div>
    );
  }

  if (!qrCodeUrl) {
    return (
      <div className="p-4 sm:p-6 bg-red-50/50 border-2 border-red-200 rounded-xl">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm sm:text-base font-semibold text-red-900 mb-1">Failed to generate QR code</p>
            <p className="text-xs sm:text-sm text-red-700 mb-3">Please try again or contact support if the issue persists.</p>
            {onRefresh && (
              <Button 
                onClick={onRefresh} 
                variant="outline" 
                size="sm" 
                className="w-full sm:w-auto min-h-[44px] touch-manipulation border-2 border-red-300 text-red-700 hover:bg-red-50"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 bg-white border rounded-xl shadow-sm">
      <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
        <div className="p-1.5 sm:p-2 bg-[#FF0077]/10 rounded-lg flex-shrink-0">
          <QrCode className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF0077]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm sm:text-base font-semibold text-gray-900 mb-1 leading-tight">{title}</p>
          {description && (
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">{description}</p>
          )}
        </div>
      </div>

      {/* QR Code Display - Mobile Optimized */}
      <div className="flex flex-col items-center mb-4 sm:mb-5">
        <div className="bg-white p-3 sm:p-4 rounded-xl border-2 border-gray-200 shadow-sm mb-3 sm:mb-4 w-full max-w-[280px] sm:max-w-none">
          <div className="aspect-square w-full flex items-center justify-center">
            <img
              src={qrCodeUrl}
              alt="QR Code"
              className="w-full h-full object-contain"
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-500">
          <QrCode className="w-3.5 h-3.5" />
          <span>Customer scans this code to verify</span>
        </div>
      </div>

      {/* Verification Code - Enhanced Mobile UX */}
      <div className="mb-4 sm:mb-5 p-3 sm:p-4 bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs sm:text-sm font-semibold text-gray-700">Verification Code</p>
          <span className="text-[10px] sm:text-xs text-gray-500 font-medium">15 min expiry</span>
        </div>
        <div className="flex items-stretch gap-2 sm:gap-3">
          <div className="flex-1 bg-white border-2 border-gray-300 rounded-lg px-3 sm:px-4 py-3 sm:py-3.5 flex items-center justify-center min-h-[52px] sm:min-h-[56px]">
            <p className="text-xl sm:text-2xl font-mono font-bold text-center tracking-[0.2em] text-gray-900 select-all">
              {qrData.verification_code}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyCode}
            className="min-w-[52px] sm:min-w-[56px] min-h-[52px] sm:min-h-[56px] touch-manipulation active:scale-95 transition-transform border-2"
            aria-label="Copy verification code"
          >
            <Copy className="w-5 h-5 sm:w-5 sm:h-5" />
          </Button>
        </div>
        <p className="text-[10px] sm:text-xs text-gray-500 mt-2.5 text-center">
          Tap code to select • Share with customer
        </p>
      </div>

      {/* Actions - Mobile First Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5">
        <Button
          variant="outline"
          onClick={handleDownload}
          className="w-full min-h-[48px] sm:min-h-[44px] touch-manipulation active:scale-[0.98] transition-transform font-medium text-sm sm:text-sm border-2 hover:bg-gray-50"
        >
          <Download className="w-4 h-4 sm:w-4 sm:h-4 mr-2 flex-shrink-0" />
          <span className="hidden xs:inline">Download</span>
          <span className="xs:hidden">Save</span>
        </Button>
        <Button
          variant="outline"
          onClick={handleCopyImage}
          className="w-full min-h-[48px] sm:min-h-[44px] touch-manipulation active:scale-[0.98] transition-transform font-medium text-sm sm:text-sm border-2 hover:bg-gray-50"
        >
          <Copy className="w-4 h-4 sm:w-4 sm:h-4 mr-2 flex-shrink-0" />
          <span className="hidden xs:inline">Copy Image</span>
          <span className="xs:hidden">Copy</span>
        </Button>
        {onRefresh && (
          <Button
            variant="outline"
            onClick={onRefresh}
            className="w-full min-h-[48px] sm:min-h-[44px] touch-manipulation active:scale-[0.98] transition-transform font-medium text-sm sm:text-sm border-2 hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4 sm:w-4 sm:h-4 mr-2 flex-shrink-0" />
            <span className="hidden xs:inline">Refresh</span>
            <span className="xs:hidden">New</span>
          </Button>
        )}
      </div>
    </div>
  );
}
