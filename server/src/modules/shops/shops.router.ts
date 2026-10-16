import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest, requireOwner } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../lib/audit';

export const shopsRouter = Router();

shopsRouter.use(authenticate as unknown as (req: Request, res: Response, next: NextFunction) => void);

// GET /api/shops — Owner sees all; others see their memberships
shopsRouter.get('/', async (req: Request, res: Response) => {
  const auth = (req as AuthenticatedRequest).auth;

  if (auth.isOwner) {
    const shops = await prisma.shop.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, timezone: true, status: true, address: true },
    });
    res.json({ shops });
    return;
  }

  const memberShopIds = auth.shopMemberships.map((m) => m.shopId);
  const shops = await prisma.shop.findMany({
    where: { id: { in: memberShopIds }, status: { not: 'ARCHIVED' } },
    select: { id: true, name: true, code: true, timezone: true, status: true },
  });
  res.json({ shops });
});

// GET /api/shops/metrics — Owner & branch high-level cross-shop metrics
shopsRouter.get('/metrics', async (req: Request, res: Response, next: NextFunction) => {
  const auth = (req as AuthenticatedRequest).auth;
  
  let targetShopWhere: Record<string, unknown> = { status: { not: 'ARCHIVED' } };
  if (!auth.isOwner) {
    const memberShopIds = auth.shopMemberships.map((m) => m.shopId);
    if (memberShopIds.length === 0) {
      return next(new AppError(403, 'FORBIDDEN', 'No accessible shops found.'));
    }
    targetShopWhere = { id: { in: memberShopIds }, status: { not: 'ARCHIVED' } };
  }

  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const shops = await prisma.shop.findMany({
    where: targetShopWhere,
    select: { id: true, name: true, code: true, status: true, address: true, timezone: true },
    orderBy: { name: 'asc' },
  });

  const shopIds = shops.map((s) => s.id);

  const [
    totalStaff,
    todayAttendance,
    todayUnits,
    allStaffMemberships,
    todaySessions,
  ] = await Promise.all([
    prisma.shopMembership.count({
      where: { shopId: { in: shopIds }, isActive: true },
    }),
    prisma.attendanceSession.count({
      where: { shopId: { in: shopIds }, checkInAt: { gte: startOfDay, lte: endOfDay } },
    }),
    prisma.taskUnit.findMany({
      where: {
        shopId: { in: shopIds },
        createdAt: { gte: startOfDay, lte: endOfDay },
        status: { not: 'CANCELLED' },
      },
      select: { shopId: true, status: true, activityCode: true, unitType: true },
    }),
    prisma.shopMembership.findMany({
      where: { shopId: { in: shopIds }, isActive: true },
      select: { shopId: true, staffMemberId: true },
    }),
    prisma.attendanceSession.findMany({
      where: { shopId: { in: shopIds }, checkInAt: { gte: startOfDay, lte: endOfDay } },
      select: { shopId: true, staffMemberId: true },
    }),
  ]);

  let totalCompleted = 0;
  let totalPending = 0;
  const activityCounts: Record<string, number> = {
    wash: 0,
    dry: 0,
    iron: 0,
    fold: 0,
    pack: 0,
    delivery: 0,
    pickup: 0,
  };

  const perShopMap: Record<string, {
    staffCount: number;
    attendanceCount: number;
    totalUnits: number;
    completedUnits: number;
    pendingUnits: number;
  }> = {};

  for (const shop of shops) {
    perShopMap[shop.id] = {
      staffCount: 0,
      attendanceCount: 0,
      totalUnits: 0,
      completedUnits: 0,
      pendingUnits: 0,
    };
  }

  for (const m of allStaffMemberships) {
    if (perShopMap[m.shopId]) {
      perShopMap[m.shopId].staffCount++;
    }
  }

  const attendanceByShopAndStaff = new Set<string>();
  for (const s of todaySessions) {
    const key = `${s.shopId}_${s.staffMemberId}`;
    if (!attendanceByShopAndStaff.has(key)) {
      attendanceByShopAndStaff.add(key);
      if (perShopMap[s.shopId]) {
        perShopMap[s.shopId].attendanceCount++;
      }
    }
  }

  for (const u of todayUnits) {
    if (u.status === 'COMPLETED') {
      totalCompleted++;
      if (perShopMap[u.shopId]) perShopMap[u.shopId].completedUnits++;
    } else {
      totalPending++;
      if (perShopMap[u.shopId]) perShopMap[u.shopId].pendingUnits++;
    }
    if (perShopMap[u.shopId]) perShopMap[u.shopId].totalUnits++;

    const code = (u.activityCode || '').toUpperCase();
    if (code.includes('WASH')) activityCounts.wash++;
    else if (code.includes('DRY')) activityCounts.dry++;
    else if (code.includes('IRON')) activityCounts.iron++;
    else if (code.includes('FOLD')) activityCounts.fold++;
    else if (code.includes('PACK')) activityCounts.pack++;
    else if (u.unitType === 'PER_ORDER') activityCounts.delivery++;
    else if (u.unitType === 'COUNT_BASED') activityCounts.pickup++;
  }

  const shopMetrics = shops.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    status: s.status,
    address: s.address,
    staffCount: perShopMap[s.id]?.staffCount || 0,
    todayAttendance: perShopMap[s.id]?.attendanceCount || 0,
    todayTotalUnits: perShopMap[s.id]?.totalUnits || 0,
    todayCompletedUnits: perShopMap[s.id]?.completedUnits || 0,
    todayPendingUnits: perShopMap[s.id]?.pendingUnits || 0,
  }));

  res.json({
    global: {
      totalShops: shops.length,
      totalActiveStaff: totalStaff,
      todayAttendanceCount: todayAttendance,
      todayTotalUnits: totalCompleted + totalPending,
      todayCompletedUnits: totalCompleted,
      todayPendingUnits: totalPending,
      activityBreakdown: activityCounts,
    },
    shops: shopMetrics,
  });
});

// POST /api/shops — Owner only
shopsRouter.post(
  '/',
  requireOwner as unknown as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const schema = z.object({
      name: z.string().min(1).max(200),
      code: z.string().min(1).max(50).regex(/^[a-zA-Z0-9-_]+$/).transform((c) => c.trim()),
      timezone: z.string().default('Asia/Kolkata'),
      address: z.string().max(500).optional(),
      contactInfo: z.string().max(500).optional(),
    });

    const body = schema.parse(req.body);

    const existing = await prisma.shop.findUnique({ where: { code: body.code } });
    if (existing) {
      return next(new AppError(409, 'CONFLICT', 'A shop with this code already exists.'));
    }

    const shop = await prisma.shop.create({ data: body });

    logAudit({
      action: 'shop.created',
      entityType: 'Shop',
      entityId: shop.id,
      actorAccountId: auth.accountId,
      shopId: shop.id,
      metadata: { name: shop.name, code: shop.code },
    });

    res.status(201).json(shop);
  }
);

// GET /api/shops/:shopId
shopsRouter.get('/:shopId', async (req: Request, res: Response, next: NextFunction) => {
  const auth = (req as AuthenticatedRequest).auth;
  const { shopId } = req.params as { shopId: string };

  const hasAccess =
    auth.isOwner || auth.shopMemberships.some((m) => m.shopId === shopId);
  if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, name: true, code: true, timezone: true, status: true, address: true, contactInfo: true },
  });
  if (!shop) return next(new AppError(404, 'NOT_FOUND', 'Shop not found.'));

  res.json(shop);
});

// GET /api/shops/:shopId/supervisor/dashboard — Supervisor Dashboard metrics and staff performance
shopsRouter.get('/:shopId/supervisor/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  const auth = (req as AuthenticatedRequest).auth;
  const { shopId } = req.params as { shopId: string };

  const hasAccess = auth.isOwner || auth.shopMemberships.some((m) => m.shopId === shopId);
  if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));

  const dateStr = req.query['date'] as string;
  const targetDate = dateStr ? new Date(dateStr) : new Date();
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  // 1. All active staff in this shop
  const staffMemberships = await prisma.shopMembership.findMany({
    where: { shopId, isActive: true },
    include: {
      staffMember: { select: { id: true, fullName: true, mobile: true, profilePhotoPath: true } },
      positionCategory: { select: { id: true, name: true } },
    },
    orderBy: { staffMember: { fullName: 'asc' } },
  });

  // 2. Attendance on targetDate
  const attendanceSessions = await prisma.attendanceSession.findMany({
    where: {
      shopId,
      checkInAt: { gte: startOfDay, lte: endOfDay },
    },
    orderBy: { checkInAt: 'desc' },
    select: { staffMemberId: true, checkInAt: true, checkInPhotoPath: true, checkOutAt: true, checkOutPhotoPath: true, status: true },
  });

  const sessionMap = new Map<string, typeof attendanceSessions[0]>();
  for (const s of attendanceSessions) {
    if (!sessionMap.has(s.staffMemberId)) {
      sessionMap.set(s.staffMemberId, s);
    }
  }

  // Only count staff whose attendance tracking is enabled
  const attendanceTrackedStaff = staffMemberships.filter(
    (m) => (m as typeof m & { attendanceEnabled?: boolean }).attendanceEnabled !== false
  );

  let activeOnFloorCount = 0;
  let completedShiftCount = 0;
  let presentCount = 0;

  for (const m of attendanceTrackedStaff) {
    const session = sessionMap.get(m.staffMemberId);
    if (session) {
      presentCount++;
      if (session.status === 'OPEN' && !session.checkOutAt) {
        activeOnFloorCount++;
      } else {
        completedShiftCount++;
      }
    }
  }

  const totalStaff = attendanceTrackedStaff.length;
  const absentCount = Math.max(0, totalStaff - presentCount);

  // 3. Tasks on targetDate
  const assignments = await prisma.taskAssignment.findMany({
    where: {
      shopId,
      assignmentDate: { gte: startOfDay, lte: endOfDay },
      status: 'ACTIVE',
    },
    select: {
      id: true,
      staffMemberId: true,
      serviceType: { select: { code: true, name: true } },
      taskUnits: {
        where: { status: { not: 'CANCELLED' } },
        select: { status: true, activityCode: true, unitType: true },
      },
    },
  });

  let todayTotalUnits = 0;
  let todayCompletedUnits = 0;
  const staffTaskMap: Record<string, { total: number; completed: number }> = {};

  const departmentBreakdown = {
    wash: { name: 'Washing & Cleaning', total: 0, completed: 0, percentage: 0 },
    iron: { name: 'Steam Press & Ironing', total: 0, completed: 0, percentage: 0 },
    dryClean: { name: 'Dry Clean & Delicate', total: 0, completed: 0, percentage: 0 },
    packaging: { name: 'Packaging & Dispatch', total: 0, completed: 0, percentage: 0 },
    pickup: { name: 'Pickup Orders', total: 0, completed: 0, percentage: 0 },
  };

  for (const a of assignments) {
    const isDryClean = a.serviceType?.code === 'CL' || (a.serviceType?.name || '').toLowerCase().includes('dry clean');

    if (!staffTaskMap[a.staffMemberId]) {
      staffTaskMap[a.staffMemberId] = { total: 0, completed: 0 };
    }

    for (const u of a.taskUnits) {
      todayTotalUnits++;
      staffTaskMap[a.staffMemberId].total++;
      const isDone = u.status === 'COMPLETED';
      if (isDone) {
        todayCompletedUnits++;
        staffTaskMap[a.staffMemberId].completed++;
      }

      const code = (u.activityCode || '').toUpperCase();
      if (code.includes('PICKUP')) {
        departmentBreakdown.pickup.total++;
        if (isDone) departmentBreakdown.pickup.completed++;
      } else if (code.includes('WASH') || code.includes('WET')) {
        departmentBreakdown.wash.total++;
        if (isDone) departmentBreakdown.wash.completed++;
      } else if (code.includes('IRON') || code.includes('PRESS')) {
        departmentBreakdown.iron.total++;
        if (isDone) departmentBreakdown.iron.completed++;
      } else if (code.includes('DRY') || isDryClean) {
        departmentBreakdown.dryClean.total++;
        if (isDone) departmentBreakdown.dryClean.completed++;
      } else if (code.includes('PACK') || code.includes('FOLD') || code.includes('DELIVER') || u.unitType === 'PER_ORDER' || u.unitType === 'COUNT_BASED') {
        departmentBreakdown.packaging.total++;
        if (isDone) departmentBreakdown.packaging.completed++;
      } else {
        departmentBreakdown.wash.total++;
        if (isDone) departmentBreakdown.wash.completed++;
      }
    }
  }

  // Calculate percentages dynamically from DB
  departmentBreakdown.wash.percentage = departmentBreakdown.wash.total > 0
    ? Math.round((departmentBreakdown.wash.completed / departmentBreakdown.wash.total) * 100) : 0;
  departmentBreakdown.iron.percentage = departmentBreakdown.iron.total > 0
    ? Math.round((departmentBreakdown.iron.completed / departmentBreakdown.iron.total) * 100) : 0;
  departmentBreakdown.dryClean.percentage = departmentBreakdown.dryClean.total > 0
    ? Math.round((departmentBreakdown.dryClean.completed / departmentBreakdown.dryClean.total) * 100) : 0;
  departmentBreakdown.packaging.percentage = departmentBreakdown.packaging.total > 0
    ? Math.round((departmentBreakdown.packaging.completed / departmentBreakdown.packaging.total) * 100) : 0;
  departmentBreakdown.pickup.percentage = departmentBreakdown.pickup.total > 0
    ? Math.round((departmentBreakdown.pickup.completed / departmentBreakdown.pickup.total) * 100) : 0;

  const todayPendingUnits = todayTotalUnits - todayCompletedUnits;
  const completionPercentage = todayTotalUnits > 0
    ? Math.round((todayCompletedUnits / todayTotalUnits) * 100)
    : 0;

  // 4. Staff Performance list for dashboard
  const staffPerformance = staffMemberships.map((m) => {
    const taskData = staffTaskMap[m.staffMemberId] || { total: 0, completed: 0 };
    const pct = taskData.total > 0
      ? Math.round((taskData.completed / taskData.total) * 100)
      : 0;
    const session = sessionMap.get(m.staffMemberId);
    const isPresent = !!session;
    const isOnFloor = session ? (session.status === 'OPEN' && !session.checkOutAt) : false;
    const isShiftCompleted = session ? (session.status === 'CLOSED' || !!session.checkOutAt) : false;

    const isAttendanceEnabled = (m as typeof m & { attendanceEnabled?: boolean }).attendanceEnabled !== false;

    return {
      staffId: m.staffMemberId,
      fullName: m.staffMember.fullName,
      position: m.positionCategory?.name || 'Staff Employee',
      percentage: pct,
      totalUnits: taskData.total,
      completedUnits: taskData.completed,
      attendanceEnabled: isAttendanceEnabled,
      isPresent,
      isOnFloor,
      isShiftCompleted,
      attendanceStatus: !isAttendanceEnabled
        ? 'EXEMPT'
        : isOnFloor
        ? 'ON_FLOOR'
        : isShiftCompleted
        ? 'COMPLETED'
        : 'ABSENT',
      checkInAt: session?.checkInAt || null,
      checkInPhotoPath: session?.checkInPhotoPath || null,
      checkOutAt: session?.checkOutAt || null,
      checkOutPhotoPath: session?.checkOutPhotoPath || null,
    };
  });

  staffPerformance.sort((a, b) => b.percentage - a.percentage);

  res.json({
    date: targetDate.toISOString().split('T')[0],
    totalStaff,
    totalEmployees: staffMemberships.length,
    presentCount,
    activeOnFloorCount,
    completedShiftCount,
    absentCount,
    todayTasks: {
      total: todayTotalUnits,
      completed: todayCompletedUnits,
      pending: todayPendingUnits,
      percentage: completionPercentage,
    },
    staffPerformance,
    departmentBreakdown,
  });
});

// PATCH /api/shops/:shopId — Owner only
shopsRouter.patch(
  '/:shopId',
  requireOwner as unknown as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response, next: NextFunction) => {
    const { shopId } = req.params as { shopId: string };
    const schema = z.object({
      name: z.string().min(1).max(200).optional(),
      code: z.string().min(1).max(50).regex(/^[a-zA-Z0-9-_]+$/).optional(),
      timezone: z.string().optional(),
      address: z.string().max(500).nullable().optional(),
      contactInfo: z.string().max(500).nullable().optional(),
      status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
    });
    const body = schema.parse(req.body);

    if (body.code) {
      const existing = await prisma.shop.findFirst({
        where: { code: body.code, id: { not: shopId } },
      });
      if (existing) {
        return next(new AppError(409, 'CONFLICT', 'A shop with this code already exists.'));
      }
    }

    const shop = await prisma.shop.update({ where: { id: shopId }, data: body });

    const auth = (req as AuthenticatedRequest).auth;
    logAudit({
      action: 'shop.updated',
      entityType: 'Shop',
      entityId: shop.id,
      actorAccountId: auth.accountId,
      shopId: shop.id,
      metadata: body,
    });

    res.json(shop);
  }
);

// DELETE /api/shops/:shopId — Owner only
shopsRouter.delete(
  '/:shopId',
  requireOwner as unknown as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) return next(new AppError(404, 'NOT_FOUND', 'Shop not found.'));

    // Check if shop has real production task or attendance history
    const [taskCount, attendanceCount] = await Promise.all([
      prisma.taskAssignment.count({ where: { shopId } }),
      prisma.attendanceSession.count({ where: { shopId } }),
    ]);

    if (taskCount > 0 || attendanceCount > 0) {
      // Archive to preserve historical operational data
      const archived = await prisma.shop.update({
        where: { id: shopId },
        data: { status: 'ARCHIVED' },
      });

      logAudit({
        action: 'shop.archived',
        entityType: 'Shop',
        entityId: shopId,
        actorAccountId: auth.accountId,
        shopId: shopId,
        metadata: { reason: 'Has production history' },
      });

      res.json({
        action: 'ARCHIVED',
        message: 'Shop has historical task or attendance records and has been safely archived.',
        shop: archived,
      });
      return;
    }

    // Clean up empty associations and hard delete duplicate/unused shop
    await prisma.$transaction([
      prisma.shopMembership.deleteMany({ where: { shopId } }),
      prisma.positionCategory.deleteMany({ where: { shopId } }),
      prisma.customFieldDefinition.deleteMany({ where: { shopId } }),
      prisma.damageIncident.deleteMany({ where: { shopId } }),
      prisma.shop.delete({ where: { id: shopId } }),
    ]);

    logAudit({
      action: 'shop.deleted',
      entityType: 'Shop',
      entityId: shopId,
      actorAccountId: auth.accountId,
      shopId: null,
      metadata: { name: shop.name, code: shop.code },
    });

    res.json({ action: 'DELETED', message: 'Shop deleted successfully.' });
  }
);
