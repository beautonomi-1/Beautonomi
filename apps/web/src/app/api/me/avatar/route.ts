import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/me/avatar
 * Upload user avatar
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();
    
    // For storage operations, try using service role if available (bypasses RLS)
    // Otherwise use the regular client with user context
    let storageClient = supabase;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (supabaseUrl) {
        storageClient = createClient(supabaseUrl, serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        });
      }
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, and WebP are allowed." },
        { status: 400 }
      );
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size exceeds 5MB limit." },
        { status: 400 }
      );
    }

    // Generate file path - use simpler path format
    const fileExt = file.name.split('.').pop() || 'jpg';
    // Use user ID as folder and timestamped filename
    const fileName = `avatar-${Date.now()}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    // Convert File to ArrayBuffer for Supabase
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log('Uploading avatar:', {
      filePath,
      fileSize: file.size,
      fileType: file.type,
      userId: user.id,
    });

    // Check if bucket exists and is accessible
    const { data: buckets, error: bucketError } = await storageClient.storage.listBuckets();
    if (bucketError) {
      console.error('Error listing buckets:', bucketError);
    } else {
      const avatarsBucket = buckets?.find(b => b.name === 'avatars');
      if (!avatarsBucket) {
        throw new Error('Storage bucket "avatars" not found. Please create it in Supabase Dashboard > Storage.');
      }
      console.log('Avatars bucket found:', avatarsBucket);
    }

    // Upload to Supabase Storage
    // First, try to delete existing avatar if it exists (optional cleanup)
    try {
      const existingFiles = await storageClient.storage
        .from('avatars')
        .list(`${user.id}/`, {
          search: 'avatar-',
        });
      
      if (existingFiles.data && existingFiles.data.length > 0) {
        // Delete old avatars
        const oldFiles = existingFiles.data.map(f => `${user.id}/${f.name}`);
        await storageClient.storage
          .from('avatars')
          .remove(oldFiles);
      }
    } catch (cleanupError) {
      // Ignore cleanup errors, proceed with upload
      console.warn('Could not clean up old avatars:', cleanupError);
    }

    const { data: uploadData, error: uploadError } = await storageClient.storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.error('Avatar upload error:', {
        message: uploadError.message,
        status: (uploadError as any).status || (uploadError as any).statusCode,
        name: uploadError.name,
        error: JSON.stringify(uploadError, Object.getOwnPropertyNames(uploadError)),
        filePath,
        fileSize: file.size,
        fileType: file.type,
        userId: user.id,
      });
      
      // Provide more specific error messages
      const errorMsg = uploadError.message || '';
      
      if (errorMsg.includes('Bucket not found') || errorMsg.includes('does not exist') || errorMsg.includes('The resource was not found')) {
        throw new Error('Storage bucket "avatars" not found. Please create it in Supabase Dashboard > Storage.');
      }
      
      if (errorMsg.includes('row-level security') || errorMsg.includes('RLS') || errorMsg.includes('permission')) {
        throw new Error('Permission denied. Please check storage bucket policies in Supabase Dashboard.');
      }
      
      if (errorMsg.includes('duplicate') || errorMsg.includes('already exists')) {
        // File already exists, try to get the URL
        const { data: { publicUrl } } = storageClient.storage
          .from('avatars')
          .getPublicUrl(filePath);
        return successResponse({ url: publicUrl, path: filePath });
      }
      
      // Return the actual error message for debugging
      throw new Error(`Upload failed: ${errorMsg || 'Unknown error'}`);
    }

    if (!uploadData) {
      throw new Error('Upload succeeded but no data returned');
    }

    // Get public URL
    const { data: { publicUrl } } = storageClient.storage
      .from('avatars')
      .getPublicUrl(uploadData.path);

    return successResponse({ url: publicUrl, path: uploadData.path });
  } catch (error) {
    console.error('Avatar upload route error:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return handleApiError(error, "Failed to upload avatar");
  }
}
