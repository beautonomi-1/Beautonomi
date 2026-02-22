"use client";

import React, { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Camera, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { validateQRCodeData, type QRCodeData } from "@/lib/qr/generator";

interface QRCodeScannerProps {
  onScan: (data: QRCodeData) => void;
  onClose: () => void;
  bookingId: string;
  title?: string;
}

export function QRCodeScanner({
  onScan,
  onClose,
  bookingId,
  title = "Scan QR Code",
}: QRCodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<QRCodeData | null>(null);

  useEffect(() => {
    startScanner();
    return () => {
      stopScanner();
    };
  }, []);

  const startScanner = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // Use back camera on mobile
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsScanning(true);
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      setError("Unable to access camera. Please check permissions.");
      toast.error("Camera access denied");
    }
  };

  const stopScanner = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  const handleManualInput = () => {
    const code = prompt("Enter verification code:");
    if (code && code.length === 8) {
      // Create QR data from manual input
      const qrData: QRCodeData = {
        booking_id: bookingId,
        booking_number: "", // Will be validated on server
        verification_code: code.toUpperCase(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        type: "arrival_verification",
      };
      handleQRCodeScanned(qrData);
    } else if (code) {
      toast.error("Invalid verification code format");
    }
  };

  const handleQRCodeScanned = (data: QRCodeData) => {
    if (validateQRCodeData(data, bookingId)) {
      setScannedData(data);
      onScan(data);
      stopScanner();
    } else {
      toast.error("Invalid or expired QR code");
    }
  };

  // Note: For full QR code scanning, you would need to integrate a library like
  // @zxing/library or html5-qrcode. This is a basic implementation.
  // For now, we'll use manual input as a fallback.

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              stopScanner();
              onClose();
            }}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900 mb-1">Camera Error</p>
                <p className="text-xs text-red-700">{error}</p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Video Preview */}
        <div className="relative bg-black rounded-lg overflow-hidden mb-4" style={{ aspectRatio: "1" }}>
          {isScanning ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Camera className="w-16 h-16 text-gray-400" />
            </div>
          )}
          {/* Scanning overlay */}
          {isScanning && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-64 h-64 border-4 border-[#FF0077] rounded-lg" />
            </div>
          )}
        </div>

        {/* Manual Input Fallback */}
        <div className="space-y-3">
          <p className="text-sm text-gray-600 text-center">
            Point camera at QR code or enter code manually
          </p>
          <Button
            onClick={handleManualInput}
            variant="outline"
            className="w-full min-h-[44px] touch-manipulation"
          >
            Enter Code Manually
          </Button>
          <Button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            variant="ghost"
            className="w-full min-h-[44px] touch-manipulation"
          >
            Cancel
          </Button>
        </div>

        {scannedData && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              QR code scanned successfully!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
