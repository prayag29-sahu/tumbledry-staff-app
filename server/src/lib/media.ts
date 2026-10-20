import crypto from 'crypto';
import { env } from '../config/env';
import { prisma } from '../db/prisma';

/**
 * Signed media URLs.
 *
 * Photos (attendance selfies, staff photos) can be large base64 data URLs stored in the DB.
 * Embedding them in list/dashboard JSON made every refresh download megabytes.
 * Instead, list endpoints return a short signed URL; the browser loads (and caches) the
 * image only when it is actually displayed. Works in <img src> without auth headers because
 * the signature (HMAC with the server secret) + expiry is the authorisation.
 */
export type MediaKind = 'att-in' | 'att-out' | 'staff-photo';

const MEDIA_KINDS: MediaKind[] = ['att-in', 'att-out', 'staff-photo'];
const URL_LIFETIME_SECONDS = 12 * 60 * 60; // 12h
const BUCKET_SECONDS = 60 * 60; // round expiry to the hour so URLs stay stable (browser cache hits)

function sign(kind: string, id: string, exp: number): string {
  return crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(`${kind}:${id}:${exp}`)
    .digest('base64url')
    .slice(0, 32);
}

export function isMediaKind(kind: string): kind is MediaKind {
  return (MEDIA_KINDS as string[]).includes(kind);
}

/** Build a signed, relative media URL (goes through the same /api proxy as JSON calls). */
export function signedMediaUrl(kind: MediaKind, id: string): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = Math.ceil((now + URL_LIFETIME_SECONDS) / BUCKET_SECONDS) * BUCKET_SECONDS;
  return `/api/media/${kind}/${id}?exp=${exp}&sig=${sign(kind, id, exp)}`;
}

export function verifyMediaSignature(kind: string, id: string, exp: string, sig: string): boolean {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(kind, id, expNum);
  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

/** null when nothing stored, otherwise a signed URL that serves the stored photo. */
export function mediaUrlIf(hasPhoto: boolean, kind: MediaKind, id: string): string | null {
  return hasPhoto ? signedMediaUrl(kind, id) : null;
}

/**
 * Which attendance sessions have a check-in / check-out photo — WITHOUT reading the photo
 * columns themselves (they can be hundreds of KB each).
 */
export async function attendancePhotoPresence(sessionIds: string[]): Promise<{ withIn: Set<string>; withOut: Set<string> }> {
  if (sessionIds.length === 0) return { withIn: new Set(), withOut: new Set() };
  const [inRows, outRows] = await Promise.all([
    prisma.attendanceSession.findMany({ where: { id: { in: sessionIds }, checkInPhotoPath: { not: null } }, select: { id: true } }),
    prisma.attendanceSession.findMany({ where: { id: { in: sessionIds }, checkOutPhotoPath: { not: null } }, select: { id: true } }),
  ]);
  return { withIn: new Set(inRows.map((r) => r.id)), withOut: new Set(outRows.map((r) => r.id)) };
}

/** Which staff members have a profile photo, without reading the photo column. */
export async function staffPhotoPresence(staffIds: string[]): Promise<Set<string>> {
  if (staffIds.length === 0) return new Set();
  const rows = await prisma.staffMember.findMany({
    where: { id: { in: staffIds }, profilePhotoPath: { not: null } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}
