import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

let supabaseClient: SupabaseClient | null = null;

function getSupabaseUrl(): string | null {
  if (env.SUPABASE_URL) return env.SUPABASE_URL;
  if (env.SUPABASE_STORAGE_URL) {
    try {
      const parsed = new URL(env.SUPABASE_STORAGE_URL);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      // ignore
    }
  }
  // Auto-detect project ref from Supabase DATABASE_URL if available
  if (env.DATABASE_URL && env.DATABASE_URL.includes('supabase.com')) {
    const match = /postgres\.([a-z0-9_-]+):/i.exec(env.DATABASE_URL);
    if (match && match[1]) {
      return `https://${match[1]}.supabase.co`;
    }
  }
  return null;
}

function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const url = getSupabaseUrl();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && serviceKey && serviceKey.trim().length > 0) {
    try {
      supabaseClient = createClient(url, serviceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      logger.info('[STORAGE] Supabase Storage client initialized successfully', { url });
    } catch (err) {
      logger.warn('[STORAGE] Failed to initialize Supabase Storage client', { error: err });
    }
  }

  return supabaseClient;
}

/**
 * Uploads a base64 Data URL to Supabase Storage if configured.
 *
 * Fallback Behavior:
 * - If already a URL (http/https), returns it as-is.
 * - If Supabase credentials are not configured, returns the original base64 Data URL safely.
 * - If upload fails for any reason, falls back to returning the original base64 Data URL so no business logic breaks.
 */
export async function uploadToSupabaseStorageIfConfigured(
  dataUriOrUrl: string | null | undefined,
  bucket: 'attendance' | 'damage' | 'profiles',
  fileNamePrefix: string = 'media'
): Promise<string | null> {
  if (!dataUriOrUrl || typeof dataUriOrUrl !== 'string') {
    return null;
  }

  // If already an HTTP/HTTPS URL, no upload needed
  if (/^https?:\/\//i.test(dataUriOrUrl)) {
    return dataUriOrUrl;
  }

  // If not a data URI, return as-is
  if (!dataUriOrUrl.startsWith('data:')) {
    return dataUriOrUrl;
  }

  const client = getSupabaseClient();
  if (!client) {
    // Graceful fallback: keep compressed base64 in DB
    return dataUriOrUrl;
  }

  try {
    const match = /^data:([\w/+.-]+);base64,(.*)$/s.exec(dataUriOrUrl);
    if (!match) {
      return dataUriOrUrl;
    }

    const contentType = match[1] || 'image/jpeg';
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Extension from mime
    let ext = 'jpg';
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('webp')) ext = 'webp';

    const safePrefix = fileNamePrefix.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safePrefix}_${Date.now()}_${uuidv4().slice(0, 8)}.${ext}`;

    const bucketName =
      bucket === 'attendance'
        ? env.SUPABASE_BUCKET_ATTENDANCE
        : bucket === 'damage'
        ? env.SUPABASE_BUCKET_DAMAGE
        : env.SUPABASE_BUCKET_PROFILES;

    const { error: uploadError } = await client.storage
      .from(bucketName)
      .upload(fileName, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      logger.warn('[STORAGE] Supabase Storage upload failed, falling back to database base64', {
        bucket: bucketName,
        fileName,
        error: uploadError.message,
      });
      return dataUriOrUrl;
    }

    const { data: publicData } = client.storage.from(bucketName).getPublicUrl(fileName);
    const publicUrl = publicData?.publicUrl;

    if (publicUrl) {
      logger.info('[STORAGE] Uploaded to Supabase Storage successfully', {
        bucket: bucketName,
        fileName,
        publicUrl,
        sizeBytes: buffer.length,
      });
      return publicUrl;
    }

    return dataUriOrUrl;
  } catch (err) {
    logger.warn('[STORAGE] Error uploading to Supabase Storage, using fallback', {
      error: err instanceof Error ? err.message : err,
    });
    return dataUriOrUrl;
  }
}
