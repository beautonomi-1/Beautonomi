import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CropRequest, CropResult } from "./types";
import { ImageCropperOverlay } from "./ImageCropperOverlay";

type ImageCropperContextValue = {
  open: (request: CropRequest) => Promise<CropResult | null>;
};

const ImageCropperContext = createContext<ImageCropperContextValue | null>(null);

export function ImageCropperProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<CropRequest | null>(null);
  const pendingRef = useRef<((result: CropResult | null) => void) | null>(null);

  const close = useCallback((result: CropResult | null) => {
    pendingRef.current?.(result);
    pendingRef.current = null;
    setRequest(null);
  }, []);

  const open = useCallback((next: CropRequest) => {
    return new Promise<CropResult | null>((resolve) => {
      pendingRef.current = resolve;
      setRequest(next);
    });
  }, []);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <ImageCropperContext.Provider value={value}>
      {children}
      {request ? <ImageCropperOverlay request={request} onClose={close} /> : null}
    </ImageCropperContext.Provider>
  );
}

export function useImageCropper(): ImageCropperContextValue {
  const ctx = useContext(ImageCropperContext);
  if (!ctx) {
    throw new Error("useImageCropper must be used within ImageCropperProvider");
  }
  return ctx;
}
