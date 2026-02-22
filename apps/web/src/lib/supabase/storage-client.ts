/**
 * Supabase Storage Utilities - Client Side Only
 * 
 * Helper functions for file uploads, image optimization, and storage management
 * This file only contains client-side safe code.
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

export const IMAGE_CONSTRAINTS = {
  maxSizeBytes: 5 * 1024 * 1024, // 5MB
  maxSizeMB: 5,
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
};

/**
 * Upload file to Supabase Storage (client-side)
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

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      contentType: contentType || file.type || 'application/octet-stream',
      cacheControl: cacheControl || '3600',
      upsert,
    });

  if (error) {
    // Provide more detailed error message
    let errorMessage = `Failed to upload file: ${error.message}`;
    
    if (error.message.includes('row-level security') || error.message.includes('RLS')) {
      errorMessage += `\n\nThis is likely an RLS policy issue. Please ensure:
1. The storage bucket "${bucket}" exists
2. RLS policies have been applied (check migrations)
3. You have permission to upload to this bucket`;
    } else if (error.message.includes('not found') || error.message.includes('does not exist')) {
      errorMessage += `\n\nThe storage bucket "${bucket}" may not exist. Please create it in Supabase Dashboard > Storage`;
    }
    
    console.error('Storage upload error:', {
      bucket,
      path: filePath,
      error: error.message,
      errorCode: (error as any).statusCode,
    });
    
    throw new Error(errorMessage);
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  return {
    path: filePath,
    fullPath: data.path,
    publicUrl,
  };
}

/**
 * Delete file from storage (client-side)
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
 * Get public URL for a file
 */
export function getPublicUrl(bucket: BucketName, path: string): string {
  const supabase = getSupabaseClient();
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);
  
  return publicUrl;
}

/**
 * List files in a bucket path
 */
export async function listFiles(
  bucket: BucketName,
  path?: string
): Promise<{ name: string; id: string; created_at: string }[]> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(path || '', {
      sortBy: { column: 'created_at', order: 'desc' },
    });

  if (error) {
    throw new Error(`Failed to list files: ${error.message}`);
  }

  return data || [];
}

/**
 * Upload avatar image
 */
export async function uploadAvatar(
  userId: string,
  file: File | Blob
): Promise<UploadResult> {
  return uploadFile({
    bucket: 'avatars',
    path: userId,
    file,
    contentType: file instanceof File ? file.type : 'image/jpeg',
    cacheControl: '3600',
    upsert: true,
  });
}

/**
 * Upload provider thumbnail image
 */
export async function uploadProviderThumbnail(
  providerId: string,
  file: File | Blob
): Promise<UploadResult> {
  return uploadFile({
    bucket: 'provider-gallery',
    path: `${providerId}/thumbnail`,
    file,
    contentType: file instanceof File ? file.type : 'image/jpeg',
    cacheControl: '3600',
    upsert: true,
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
export function validateFileType(file: File, allowedTypes?: string[]): boolean {
  const types = allowedTypes || IMAGE_CONSTRAINTS.allowedTypes;
  return types.includes(file.type);
}

/**
 * Validate file size
 */
export function validateFileSize(file: File, maxSizeBytes?: number): boolean {
  const maxSize = maxSizeBytes || IMAGE_CONSTRAINTS.maxSizeBytes;
  return file.size <= maxSize;
}
