import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';
import { isMediaKind, verifyMediaSignature } from '../../lib/media';

/**
 * GET /api/media/:kind/:id?exp=&sig=
 * Serves a stored photo referenced by a signed URL (see lib/media.ts).
 *  - base64 data URL in DB  → decoded binary image (cacheable)
 *  - http(s) URL in DB      → 302 redirect to the storage URL
 */
export const mediaRouter = Router();

mediaRouter.get('/:kind/:id', async (req: Request, res: Response, next: NextFunction) => {
  const { kind, id } = req.params as { kind: string; id: string };
  const { exp = '', sig = '' } = req.query as Record<string, string>;

  if (!isMediaKind(kind) || !verifyMediaSignature(kind, id, exp, sig)) {
    return next(new AppError(403, 'FORBIDDEN', 'Invalid or expired media link.'));
  }

  let stored: string | null = null;
  if (kind === 'att-in' || kind === 'att-out') {
    const row = await prisma.attendanceSession.findUnique({
      where: { id },
      select: kind === 'att-in' ? { checkInPhotoPath: true } : { checkOutPhotoPath: true },
    });
    stored = (row as { checkInPhotoPath?: string | null; checkOutPhotoPath?: string | null } | null)?.[
      kind === 'att-in' ? 'checkInPhotoPath' : 'checkOutPhotoPath'
    ] ?? null;
  } else {
    const row = await prisma.staffMember.findUnique({ where: { id }, select: { profilePhotoPath: true } });
    stored = row?.profilePhotoPath ?? null;
  }

  if (!stored) return next(new AppError(404, 'NOT_FOUND', 'Photo not found.'));

  if (/^https?:\/\//i.test(stored)) {
    return res.redirect(302, stored);
  }

  const match = /^data:([\w/+.-]+);base64,(.*)$/s.exec(stored);
  if (!match) return next(new AppError(404, 'NOT_FOUND', 'Photo not available.'));

  const buffer = Buffer.from(match[2], 'base64');
  res.setHeader('Content-Type', match[1]);
  res.setHeader('Content-Length', String(buffer.length));
  // Photos never change for a given record → let the browser cache them
  res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
  res.end(buffer);
});
