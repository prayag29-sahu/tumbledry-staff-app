import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../lib/audit';
import { dayBounds, anchorTimeForDay } from '../../lib/dateRange';
import { attendancePhotoPresence, mediaUrlIf } from '../../lib/media';
import { evaluateAttendance } from '../../lib/attendanceEvaluation';

/** Session columns WITHOUT the heavy photo blobs (photos are served via signed media URLs). */
const SESSION_LIGHT_SELECT = {
  id: true,
  shopId: true,
  staffMemberId: true,
  checkInAt: true,
  checkOutAt: true,
  durationMinutes: true,
  status: true,
  attendanceType: true,
  notes: true,
} as const;

/** Attach signed checkIn/checkOut photo URLs to light session rows. */
async function withPhotoUrls<T extends { id: string }>(sessions: T[]) {
  const presence = await attendancePhotoPresence(sessions.map((s) => s.id));
  return sessions.map((s) => ({
    ...s,
    checkInPhotoPath: mediaUrlIf(presence.withIn.has(s.id), 'att-in', s.id),
    checkOutPhotoPath: mediaUrlIf(presence.withOut.has(s.id), 'att-out', s.id),
  }));
}

export const attendanceRouter = Router();

attendanceRouter.use(authenticate as unknown as (req: Request, res: Response, next: NextFunction) => void);

// POST /api/shops/:shopId/attendance/check-in
// Requires photo upload — handled by multipart form in app.ts
attendanceRouter.post(
  '/shops/:shopId/attendance/check-in',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    // Find staff membership with shift timing configurations
    const membership = await prisma.shopMembership.findFirst({
      where: { accountId: auth.accountId, shopId, isActive: true },
      select: {
        staffMemberId: true,
        shiftStartTime: true,
        shiftEndTime: true,
        lateThreshold: true,
        halfDayThreshold: true,
        halfDayMinHours: true,
        fullDayMinHours: true,
      },
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

    const checkInAt = new Date(); // server timestamp
    const evaluation = evaluateAttendance(
      { checkInAt, status: 'OPEN' },
      membership
    );

    const session = await prisma.attendanceSession.create({
      data: {
        shopId,
        staffMemberId: membership.staffMemberId,
        checkInAt,
        checkInPhotoPath: photoPath,
        status: 'OPEN',
        attendanceType: evaluation.attendanceType,
        notes: evaluation.statusReason,
      },
    });

    res.status(201).json({
      sessionId: session.id,
      checkInAt: session.checkInAt,
      attendanceType: session.attendanceType,
      isLate: evaluation.isLate,
      delayMinutes: evaluation.delayMinutes,
      statusReason: evaluation.statusReason,
      checkInTimeIST: evaluation.checkInTimeIST,
      message: evaluation.isLate
        ? `Checked in (Late by ${evaluation.delayMinutes} mins).`
        : 'Checked in successfully.',
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
      select: {
        staffMemberId: true,
        shiftStartTime: true,
        shiftEndTime: true,
        lateThreshold: true,
        halfDayThreshold: true,
        halfDayMinHours: true,
        fullDayMinHours: true,
      },
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

    const evaluation = evaluateAttendance(
      {
        checkInAt: openSession.checkInAt,
        checkOutAt,
        durationMinutes,
        status: 'CLOSED',
      },
      membership
    );

    const updated = await prisma.attendanceSession.update({
      where: { id: openSession.id },
      data: {
        checkOutAt,
        checkOutPhotoPath: photoPath,
        durationMinutes,
        status: 'CLOSED',
        attendanceType: evaluation.attendanceType,
        notes: evaluation.statusReason,
      },
    });

    res.json({
      sessionId: updated.id,
      checkInAt: updated.checkInAt,
      checkOutAt: updated.checkOutAt,
      durationMinutes: updated.durationMinutes,
      attendanceType: updated.attendanceType,
      isHalfDay: evaluation.isHalfDay,
      statusReason: evaluation.statusReason,
      checkInTimeIST: evaluation.checkInTimeIST,
      checkOutTimeIST: evaluation.checkOutTimeIST,
      message: 'Checked out successfully.',
    });
  }
);

// GET /api/shops/:shopId/attendance/my-session — Fetch session for logged-in staff on target date
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

    const { startOfDay, endOfDay } = dayBounds(req.query['date'] as string | undefined);

    const session = await prisma.attendanceSession.findFirst({
      where: {
        staffMemberId: membership.staffMemberId,
        shopId,
        checkInAt: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { checkInAt: 'desc' },
      select: SESSION_LIGHT_SELECT,
    });

    res.json({ session: session ? (await withPhotoUrls([session]))[0] : null });
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

    const { startOfDay, endOfDay } = dayBounds(req.query['date'] as string | undefined);

    const sessions = await prisma.attendanceSession.findMany({
      where: {
        shopId,
        checkInAt: { gte: startOfDay, lte: endOfDay },
      },
      select: {
        ...SESSION_LIGHT_SELECT,
        staffMember: { select: { id: true, fullName: true, mobile: true } },
      },
      orderBy: { checkInAt: 'desc' },
    });

    res.json({ sessions: await withPhotoUrls(sessions) });
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

    const staffMembership = await prisma.shopMembership.findFirst({
      where: { staffMemberId: staffId, shopId, isActive: true },
      select: {
        shiftStartTime: true,
        shiftEndTime: true,
        lateThreshold: true,
        halfDayThreshold: true,
        halfDayMinHours: true,
        fullDayMinHours: true,
      },
    });

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
        attendanceType: true,
        notes: true,
      },
    });

    const enrichedSessions = sessions.map((s) => {
      const evaluation = evaluateAttendance(
        {
          checkInAt: s.checkInAt,
          checkOutAt: s.checkOutAt,
          durationMinutes: s.durationMinutes,
          status: s.status,
        },
        staffMembership
      );
      const attendanceType = s.attendanceType || evaluation.attendanceType;
      return {
        ...s,
        attendanceType,
        isLate: evaluation.isLate,
        isHalfDay: attendanceType === 'HALF_DAY',
        delayMinutes: evaluation.delayMinutes,
        statusReason: s.notes || evaluation.statusReason,
        checkInTimeIST: evaluation.checkInTimeIST,
        checkOutTimeIST: evaluation.checkOutTimeIST,
      };
    });

    const halfDayCount = enrichedSessions.filter((s) => s.attendanceType === 'HALF_DAY').length;
    const lateCount = enrichedSessions.filter((s) => s.attendanceType === 'LATE' || s.isLate).length;
    const fullDayCount = enrichedSessions.filter((s) => s.attendanceType === 'PRESENT').length;
    const onFloorCount = enrichedSessions.filter((s) => s.attendanceType === 'ON_FLOOR' || s.status === 'OPEN').length;
    const totalPresentDays = fullDayCount + lateCount + halfDayCount + onFloorCount;

    const now = new Date();
    const daysInMonth = (year === now.getFullYear() && month === (now.getMonth() + 1))
      ? now.getDate()
      : new Date(year, month, 0).getDate();
    const absentCount = Math.max(0, daysInMonth - totalPresentDays);

    res.json({
      sessions: enrichedSessions,
      shiftSchedule: staffMembership ? {
        shiftStartTime: staffMembership.shiftStartTime,
        shiftEndTime: staffMembership.shiftEndTime,
        lateThreshold: staffMembership.lateThreshold,
        halfDayThreshold: staffMembership.halfDayThreshold,
        halfDayMinHours: staffMembership.halfDayMinHours ? Number(staffMembership.halfDayMinHours) : null,
        fullDayMinHours: staffMembership.fullDayMinHours ? Number(staffMembership.fullDayMinHours) : null,
      } : null,
      summary: {
        presentCount: fullDayCount,
        fullDayCount,
        lateCount,
        halfDayCount,
        onFloorCount,
        totalPresentDays,
        absentCount,
      },
      year,
      month,
    });
  }
);

// POST /api/shops/:shopId/attendance/mark-staff
// Accessible to Supervisor / Owner to record or update attendance for a staff member
attendanceRouter.post(
  '/shops/:shopId/attendance/mark-staff',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    const hasAccess = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && (
        m.capabilities.includes('attendance.read_team') ||
        m.capabilities.includes('staff.update')
      )
    );
    if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));

    const schema = z.object({
      staffMemberId: z.string().uuid(),
      status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'CHECK_OUT']),
      date: z.string().optional(),
    });
    const body = schema.parse(req.body);

    const bounds = dayBounds(body.date);
    const { startOfDay, endOfDay } = bounds;

    // Attendance can only be recorded for the CURRENT day (business timezone).
    // Past/future dates are read-only to prevent back-dated or proxy attendance.
    if (!bounds.isToday) {
      return next(new AppError(422, 'DATE_LOCKED', 'Attendance can only be marked for today. Past and future dates are view-only.'));
    }

    const [markedStaff, staffMembership] = await Promise.all([
      prisma.staffMember.findUnique({
        where: { id: body.staffMemberId },
        select: { fullName: true },
      }),
      prisma.shopMembership.findFirst({
        where: { staffMemberId: body.staffMemberId, shopId, isActive: true },
        select: {
          shiftStartTime: true,
          shiftEndTime: true,
          lateThreshold: true,
          halfDayThreshold: true,
          halfDayMinHours: true,
          fullDayMinHours: true,
        },
      }),
    ]);

    await logAudit({
      action: `attendance.marked_${body.status.toLowerCase()}`,
      entityType: 'AttendanceSession',
      entityId: body.staffMemberId,
      actorAccountId: auth.accountId,
      shopId,
      metadata: {
        fullName: markedStaff?.fullName ?? null,
        status: body.status,
        date: bounds.dateKey,
      },
    });

    if (body.status === 'PRESENT') {
      let session = await prisma.attendanceSession.findFirst({
        where: {
          shopId,
          staffMemberId: body.staffMemberId,
          checkInAt: { gte: startOfDay, lte: endOfDay },
        },
      });

      const checkInAt = session?.checkInAt ?? anchorTimeForDay(bounds);
      const evalResult = evaluateAttendance({ checkInAt, status: 'OPEN' }, staffMembership);

      if (!session) {
        session = await prisma.attendanceSession.create({
          data: {
            shopId,
            staffMemberId: body.staffMemberId,
            checkInAt,
            status: 'OPEN',
            attendanceType: evalResult.attendanceType,
            notes: evalResult.statusReason,
          },
        });
      } else {
        session = await prisma.attendanceSession.update({
          where: { id: session.id },
          data: {
            attendanceType: evalResult.attendanceType,
            notes: evalResult.statusReason,
          },
        });
      }
      return res.json({ success: true, session, message: 'Marked as Present.' });
    }

    if (body.status === 'CHECK_OUT') {
      const openSession = await prisma.attendanceSession.findFirst({
        where: {
          shopId,
          staffMemberId: body.staffMemberId,
          status: 'OPEN',
          checkInAt: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: { checkInAt: 'desc' },
      });

      if (openSession && openSession.checkInAt) {
        // For a past day, never record a checkout later than the end of that day
        const checkOutAt = bounds.isToday ? new Date() : new Date(Math.min(endOfDay.getTime(), openSession.checkInAt.getTime() + 8 * 60 * 60 * 1000));
        const durationMinutes = Math.max(1, Math.floor((checkOutAt.getTime() - openSession.checkInAt.getTime()) / 60000));
        const evalResult = evaluateAttendance(
          { checkInAt: openSession.checkInAt, checkOutAt, durationMinutes, status: 'CLOSED' },
          staffMembership
        );
        await prisma.attendanceSession.update({
          where: { id: openSession.id },
          data: {
            checkOutAt,
            durationMinutes,
            status: 'CLOSED',
            attendanceType: evalResult.attendanceType,
            notes: evalResult.statusReason,
          },
        });
      }
      return res.json({ success: true, message: 'Staff checked out successfully.' });
    }

    if (body.status === 'HALF_DAY') {
      let session = await prisma.attendanceSession.findFirst({
        where: {
          shopId,
          staffMemberId: body.staffMemberId,
          checkInAt: { gte: startOfDay, lte: endOfDay },
        },
      });

      const halfDayDuration = staffMembership?.halfDayMinHours
        ? Math.round(Number(staffMembership.halfDayMinHours) * 60)
        : 240;

      const checkInAt = session?.checkInAt ?? anchorTimeForDay(bounds);
      const checkOutAt = new Date(checkInAt.getTime() + halfDayDuration * 60 * 1000);

      if (session) {
        await prisma.attendanceSession.update({
          where: { id: session.id },
          data: {
            checkOutAt,
            durationMinutes: halfDayDuration,
            status: 'CLOSED',
            attendanceType: 'HALF_DAY',
            notes: 'Marked Half Day by supervisor/owner',
          },
        });
      } else {
        await prisma.attendanceSession.create({
          data: {
            shopId,
            staffMemberId: body.staffMemberId,
            checkInAt,
            checkOutAt,
            durationMinutes: halfDayDuration,
            status: 'CLOSED',
            attendanceType: 'HALF_DAY',
            notes: 'Marked Half Day by supervisor/owner',
          },
        });
      }
      return res.json({ success: true, message: 'Marked as Half Day.' });
    }

    if (body.status === 'ABSENT') {
      await prisma.attendanceSession.deleteMany({
        where: {
          shopId,
          staffMemberId: body.staffMemberId,
          checkInAt: { gte: startOfDay, lte: endOfDay },
        },
      });
      return res.json({ success: true, message: 'Marked as Absent.' });
    }

    res.json({ success: true });
  }
);

