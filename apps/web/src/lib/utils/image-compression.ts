/**
 * Client-side Image Compression Utilities
 * 
 * Compresses images before upload to reduce file size and improve upload speed
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0
  maxSizeMB?: number; // Target max file size in MB
  outputFormat?: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface CompressionResult {
  file: Blob;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

/**
 * Compress an image file using Canvas API
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.85,
    maxSizeMB = 1,
    outputFormat = 'image/jpeg',
  } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions while maintaining aspect ratio
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }
        
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        // Draw image on canvas
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to blob with quality
        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }
            
            let finalBlob = blob;
            
            // If blob is still too large, reduce quality iteratively
            if (maxSizeMB && blob.size > maxSizeMB * 1024 * 1024) {
              finalBlob = await compressToTargetSize(
                canvas,
                outputFormat,
                maxSizeMB * 1024 * 1024,
                quality
              );
            }
            
            const originalSize = file.size;
            const compressedSize = finalBlob.size;
            const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;
            
            resolve({
              file: finalBlob,
              originalSize,
              compressedSize,
              compressionRatio,
            });
          },
          outputFormat,
          quality
        );
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Compress image to target file size by iteratively reducing quality
 * Optimized for speed - uses fewer iterations
 */
async function compressToTargetSize(
  canvas: HTMLCanvasElement,
  format: string,
  targetSize: number,
  initialQuality: number
): Promise<Blob> {
  let quality = initialQuality;
  let blob: Blob | null = null;
  const minQuality = 0.3; // Increased from 0.1 to avoid too low quality
  const maxIterations = 5; // Limit iterations for speed
  
  // Simplified binary search with iteration limit
  let low = minQuality;
  let high = initialQuality;
  let iterations = 0;
  
  while (high - low > 0.1 && iterations < maxIterations) {
    iterations++;
    quality = (low + high) / 2;
    
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), format, quality);
    });
    
    if (!blob) {
      break;
    }
    
    if (blob.size <= targetSize) {
      // Size is acceptable, try higher quality
      low = quality;
    } else {
      // Size is too large, reduce quality
      high = quality;
    }
  }
  
  // Final attempt with the best quality found
  if (!blob || blob.size > targetSize) {
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), format, low);
    });
  }
  
  return blob || new Blob();
}

/**
 * Compress multiple images
 */
export async function compressImages(
  files: File[],
  options: CompressionOptions = {}
): Promise<CompressionResult[]> {
  const results = await Promise.all(
    files.map((file) => compressImage(file, options))
  );
  return results;
}

/**
 * Get image dimensions
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        resolve({
          width: img.width,
          height: img.height,
        });
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
