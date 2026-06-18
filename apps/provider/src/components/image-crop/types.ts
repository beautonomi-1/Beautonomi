export type CropAspect = [number, number] | null;

export type CropRequest = {
  uri: string;
  width: number;
  height: number;
  aspect?: CropAspect;
  lockAspect?: boolean;
  outputMaxDimension?: number;
  quality?: number;
  fileName?: string;
  includeBase64?: boolean;
};

export type CropResult = {
  uri: string;
  width: number;
  height: number;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  base64?: string;
};

export type CropTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

export type AspectPreset = {
  label: string;
  value: CropAspect;
};

export const DEFAULT_ASPECT: [number, number] = [1, 1];

export const ASPECT_PRESETS: AspectPreset[] = [
  { label: "1:1", value: [1, 1] },
  { label: "4:5", value: [4, 5] },
  { label: "3:4", value: [3, 4] },
  { label: "16:9", value: [16, 9] },
  { label: "Free", value: null },
];

export const DEFAULT_OUTPUT_MAX_DIMENSION = 2048;
