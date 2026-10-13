import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';

export const attendanceRouter = Router();

attendanceRouter.use(authenticate as unknown as (req: Request, res: Response, next: NextFunction) => void);

// POST /api/shops/:shopId/attendance/check-in
// Requires photo upload — handled by multipart form in app.ts
attendanceRouter.post(
  '/shops/:shopId/attendance/check-in',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    // Find staff membership
    const membership = await prisma.shopMembership.findFirst({
      where: { accountId: auth.accountId, shopId, isActive: true },
      select: { staffMemberId: true },
    });
    if (!membership) {
      return next(new AppError(403, 'FORBIDDEN', 'No active membership in this shop.'));
    }

    // Check for existing open session today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existingOpen = await prisma.attendanceSession.findFirst({
      where: {
        staffMemberId: membership.staffMemberId,
        shopId,
        status: 'OPEN',
        checkInAt: { gte: today },
      },
    });
    if (existingOpen) {
      return next(new AppError(409, 'CONFLICT', 'You already have an open check-in session for today.'));
    }

    // Photo path from upload middleware or JSON payload
    const photoPath =
      (req as Request & { uploadedPhotoPath?: string }).uploadedPhotoPath ||
      (req.body as { photoPath?: string })?.photoPath;
    if (!photoPath) {
      return next(new AppError(422, 'VALIDATION_ERROR', 'A photo is required for check-in.'));
    }

    const session = await prisma.attendanceSession.create({
      data: {
        shopId,
        staffMemberId: membership.staffMemberId,
        checkInAt: new Date(), // server timestamp
        checkInPhotoPath: photoPath,
        status: 'OPEN',
      },
    });

    res.status(201).json({
      sessionId: session.id,
      checkInAt: session.checkInAt,
      message: 'Checked in successfully.',
    });
  }
);

// POST /api/shops/:shopId/attendance/check-out
attendanceRouter.post(
  '/shops/:shopId/attendance/check-out',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    const membership = await prisma.shopMembership.findFirst({
      where: { accountId: auth.accountId, shopId, isActive: true },
      select: { staffMemberId: true },
    });
    if (!membership) {
      return next(new AppError(403, 'FORBIDDEN', 'No active membership in this shop.'));
    }

    const openSession = await prisma.attendanceSession.findFirst({
      where: {
        staffMemberId: membership.staffMemberId,
        shopId,
        status: 'OPEN',
      },
      orderBy: { checkInAt: 'desc' },
    });

    if (!openSession || !openSession.checkInAt) {
      return next(new AppError(409, 'CONFLICT', 'No open check-in session found. Please check in first.'));
    }

    const photoPath =
      (req as Request & { uploadedPhotoPath?: string }).uploadedPhotoPath ||
      (req.body as { photoPath?: string })?.photoPath;
    if (!photoPath) {
      return next(new AppError(422, 'VALIDATION_ERROR', 'A photo is required for check-out.'));
    }

    const checkOutAt = new Date();
    const durationMinutes = Math.floor(
      (checkOutAt.getTime() - openSession.checkInAt.getTime()) / 60000
    );

    if (durationMinutes < 0) {
      return next(new AppError(409, 'CONFLICT', 'Check-out time cannot precede check-in time.'));
    }

    const updated = await prisma.attendanceSession.update({
      where: { id: openSession.id },
      data: {
        checkOutAt,
        checkOutPhotoPath: photoPath,
        durationMinutes,
        status: 'CLOSED',
      },
    });

    res.json({
      sessionId: updated.id,
      checkInAt: updated.checkInAt,
      checkOutAt: updated.checkOutAt,
      durationMinutes: updated.durationMinutes,
      message: 'Checked out successfully.',
    });
  }
);

// GET /api/shops/:shopId/attendance/my-session — Fetch today's current session for the logged in staff
attendanceRouter.get(
  '/shops/:shopId/attendance/my-session',
  async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    const membership = await prisma.shopMembership.findFirst({
      where: { accountId: auth.accountId, shopId, isActive: true },
      select: { staffMemberId: true },
    });
    if (!membership) {
      res.json({ session: null });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const session = await prisma.attendanceSession.findFirst({
      where: {
        staffMemberId: membership.staffMemberId,
        shopId,
        checkInAt: { gte: today },
      },
      orderBy: { checkInAt: 'desc' },
    });

    res.json({ session });
  }
);

// GET /api/shops/:shopId/attendance/today — Fetch all of today's attendance sessions for supervisor/team view
attendanceRouter.get(
  '/shops/:shopId/attendance/today',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    const hasTeamView = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && m.capabilities.includes('attendance.read_team')
    );
    if (!hasTeamView) return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sessions = await prisma.attendanceSession.findMany({
      where: {
        shopId,
        checkInAt: { gte: today },
      },
      include: {
        staffMember: { select: { id: true, fullName: true, mobile: true } },
      },
      orderBy: { checkInAt: 'desc' },
    });

    res.json({ sessions });
  }
);

// GET /api/shops/:shopId/staff/:staffId/attendance?year=YYYY&month=M
attendanceRouter.get(
  '/shops/:shopId/staff/:staffId/attendance',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, staffId } = req.params as { shopId: string; staffId: string };
    const year = parseInt(req.query['year'] as string);
    const month = parseInt(req.query['month'] as string);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return next(new AppError(422, 'VALIDATION_ERROR', 'Invalid year or month.'));
    }

    // Access control: staff can only see own attendance; team view requires capability
    const hasTeamView = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && m.capabilities.includes('attendance.read_team')
    );
    const isSelf = auth.shopMemberships.some((m) => m.shopId === shopId);

    if (!isSelf && !hasTeamView) {
      return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));
    }

    // Non-privileged: must be querying own record (validated by comparing staffMemberId)
    if (!hasTeamView) {
      const selfMembership = await prisma.shopMembership.findFirst({
        where: { accountId: auth.accountId, shopId, isActive: true },
        select: { staffMemberId: true },
      });
      if (!selfMembership || selfMembership.staffMemberId !== staffId) {
        return next(new AppError(403, 'FORBIDDEN', 'You can only view your own attendance.'));
      }
    }

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const sessions = await prisma.attendanceSession.findMany({
      where: {
        staffMemberId: staffId,
        shopId,
        checkInAt: { gte: startOfMonth, lte: endOfMonth },
      },
      orderBy: { checkInAt: 'asc' },
      select: {
        id: true,
        checkInAt: true,
        checkOutAt: true,
        durationMinutes: true,
        status: true,
        // Photo paths are NOT returned — access is via separate signed-URL endpoint
      },
    });

    res.json({ sessions, year, month });
  }
);
