/**
 * Supabase Storage Utilities
 * 
 * Helper functions for file uploads, image optimization, and storage management
 */

import { getSupabaseClient } from './client';

export type BucketName = 
  | 'avatars'
  | 'provider-gallery'
  | 'service-images'
  | 'booking-documents'
  | 'verification-documents'
  | 'receipts';

export interface UploadOptions {
  bucket: BucketName;
  path: string;
  file: File | Blob;
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
}

export interface UploadResult {
  path: string;
  fullPath: string;
  publicUrl: string;
}

/**
 * Upload a file to Supabase Storage (client-side)
 */
export async function uploadFile(
  options: UploadOptions
): Promise<UploadResult> {
  const supabase = getSupabaseClient();
  const { bucket, path, file, contentType, cacheControl, upsert = false } = options;

  const fileExt = file instanceof File 
    ? file.name.split('.').pop() 
    : 'bin';
  
  const fileName = `${path}.${fileExt}`;
  const filePath = `${Date.now()}-${fileName}`;

  const { data: _data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      contentType: contentType || file.type || 'application/octet-stream',
      cacheControl: cacheControl || '3600',
      upsert,
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  return {
    path: filePath,
    fullPath: `${bucket}/${filePath}`,
    publicUrl,
  };
}

/**
 * Upload a file to Supabase Storage (server-side)
 * Note: This function should only be used in Server Components or API routes
 */
export async function uploadFileServer(
  options: UploadOptions
): Promise<UploadResult> {
  // Dynamic import to avoid build errors in client components
  const { getSupabaseServer } = await import('./server');
  const supabase = await getSupabaseServer();
  const { bucket, path, file, contentType, cacheControl, upsert = false } = options;

  const fileExt = file instanceof File 
    ? file.name.split('.').pop() 
    : 'bin';
  
  const fileName = `${path}.${fileExt}`;
  const filePath = `${Date.now()}-${fileName}`;

  const { data: _data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      contentType: contentType || file.type || 'application/octet-stream',
      cacheControl: cacheControl || '3600',
      upsert,
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  return {
    path: filePath,
    fullPath: `${bucket}/${filePath}`,
    publicUrl,
  };
}

/**
 * Delete a file from Supabase Storage (client-side)
 */
export async function deleteFile(
  bucket: BucketName,
  path: string
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.storage
    .from(bucket)
    .remove([path]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Delete a file from Supabase Storage (server-side)
 * Note: This function should only be used in Server Components or API routes
 */
export async function deleteFileServer(
  bucket: BucketName,
  path: string
): Promise<void> {
  // Dynamic import to avoid build errors in client components
  const { getSupabaseServer } = await import('./server');
  const supabase = await getSupabaseServer();

  const { error } = await supabase.storage
    .from(bucket)
    .remove([path]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Get public URL for a file
 */
export function getPublicUrl(bucket: BucketName, path: string): string {
  const supabase = getSupabaseClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Upload user avatar
 */
export async function uploadAvatar(
  userId: string,
  file: File | Blob
): Promise<UploadResult> {
  return uploadFile({
    bucket: 'avatars',
    path: `${userId}/avatar`,
    file,
    contentType: file instanceof File ? file.type : 'image/jpeg',
    cacheControl: '3600',
  });
}

/**
 * Upload provider gallery image
 */
export async function uploadProviderGalleryImage(
  providerId: string,
  file: File | Blob,
  index?: number
): Promise<UploadResult> {
  const path = index !== undefined 
    ? `${providerId}/gallery-${index}`
    : `${providerId}/gallery-${Date.now()}`;
  
  return uploadFile({
    bucket: 'provider-gallery',
    path,
    file,
    contentType: file instanceof File ? file.type : 'image/jpeg',
    cacheControl: '3600',
  });
}

/**
 * Upload service image
 */
export async function uploadServiceImage(
  serviceId: string,
  file: File | Blob
): Promise<UploadResult> {
  return uploadFile({
    bucket: 'service-images',
    path: `${serviceId}/image`,
    file,
    contentType: file instanceof File ? file.type : 'image/jpeg',
    cacheControl: '3600',
  });
}

/**
 * Validate file type
 */
export function validateFileType(
  file: File,
  allowedTypes: string[]
): boolean {
  return allowedTypes.includes(file.type);
}

/**
 * Validate file size
 */
export function validateFileSize(
  file: File,
  maxSizeBytes: number
): boolean {
  return file.size <= maxSizeBytes;
}

/**
 * Get file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Image validation constants
 */
export const IMAGE_CONSTRAINTS = {
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  MAX_DIMENSION: 2048, // pixels
} as const;

/**
 * Document validation constants
 */
export const DOCUMENT_CONSTRAINTS = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
} as const;
