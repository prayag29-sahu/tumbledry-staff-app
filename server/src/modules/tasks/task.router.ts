import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest, requireCapability } from '../../middleware/auth';
import { createAssignment, completeTaskUnit, toggleTaskUnit, getTaskSummary, getMonthlyTaskSummary } from './task.service';
import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';
import { dbDateForDay } from '../../lib/dateRange';

export const taskRouter = Router({ mergeParams: true });

// All task routes require authentication
taskRouter.use(authenticate as unknown as (req: Request, res: Response, next: NextFunction) => void);

// GET /api/shops/:shopId/staff/:staffId/tasks?date=YYYY-MM-DD
taskRouter.get(
  '/shops/:shopId/staff/:staffId/tasks',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, staffId } = req.params as { shopId: string; staffId: string };
    const dateStr = req.query['date'] as string | undefined;
    const { dbDate, dateKey } = dbDateForDay(dateStr);

    // Staff can only see their own tasks
    const isOwnRequest = auth.shopMemberships.some(
      (m) => m.shopId === shopId
    );
    const hasTeamView = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && m.capabilities.includes('tasks.read_team')
    );

    if (!isOwnRequest && !hasTeamView) {
      return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));
    }

    // Non-privileged staff can only see their own tasks
    const staffMemberId = auth.isOwner || hasTeamView ? staffId : (
      // For regular staff, find their own staffMemberId
      auth.shopMemberships.find(m => m.shopId === shopId) ? staffId : undefined
    );

    if (!staffMemberId) {
      return next(new AppError(403, 'FORBIDDEN', 'Access denied to this staff member\'s tasks.'));
    }

    const assignments = await prisma.taskAssignment.findMany({
      where: {
        shopId,
        staffMemberId,
        assignmentDate: dbDate,
        status: 'ACTIVE',
      },
      include: {
        workflowProfile: { select: { workflowType: true, name: true } },
        serviceType: { select: { name: true, code: true } },
        damageIncidents: {
          select: {
            id: true,
            pieceNumber: true,
            status: true,
            notes: true,
            photoPath: true,
            reportedAt: true,
            taskUnitId: true,
            staffMember: { select: { id: true, fullName: true } },
          },
          orderBy: { reportedAt: 'desc' },
        },
        taskUnits: {
          where: { status: { not: 'CANCELLED' } },
          include: {
            damageIncidents: {
              select: {
                id: true,
                pieceNumber: true,
                status: true,
                notes: true,
                photoPath: true,
                reportedAt: true,
              },
            },
          },
          orderBy: [{ pieceNumber: 'asc' }, { sequenceNumber: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const summary = await getTaskSummary(staffMemberId, shopId, dbDate);

    res.json({ assignments, summary, date: dateKey });
  }
);

// GET /api/shops/:shopId/tasks?date=YYYY-MM-DD — All task assignments in the shop on date (Owner / Supervisor / Manager)
taskRouter.get(
  '/shops/:shopId/tasks',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };
    const dateStr = req.query['date'] as string | undefined;
    const { dbDate, dateKey } = dbDateForDay(dateStr);

    const hasAccess = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && (m.capabilities.includes('tasks.read_team') || m.capabilities.includes('staff.read'))
    );
    if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));

    const assignments = await prisma.taskAssignment.findMany({
      where: {
        shopId,
        assignmentDate: dbDate,
        status: 'ACTIVE',
      },
      include: {
        staffMember: { select: { id: true, fullName: true, mobile: true } },
        workflowProfile: { select: { workflowType: true, name: true } },
        serviceType: { select: { name: true, code: true } },
        damageIncidents: {
          select: {
            id: true,
            pieceNumber: true,
            status: true,
            notes: true,
            photoPath: true,
            reportedAt: true,
            taskUnitId: true,
            staffMember: { select: { id: true, fullName: true } },
          },
          orderBy: { reportedAt: 'desc' },
        },
        taskUnits: {
          where: { status: { not: 'CANCELLED' } },
          include: {
            damageIncidents: {
              select: {
                id: true,
                pieceNumber: true,
                status: true,
                notes: true,
                photoPath: true,
                reportedAt: true,
              },
            },
          },
          orderBy: [{ pieceNumber: 'asc' }, { sequenceNumber: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ assignments, date: dateKey });
  }
);

// POST /api/shops/:shopId/staff/:staffId/tasks — Manager creates an assignment
taskRouter.post(
  '/shops/:shopId/staff/:staffId/tasks',
  requireCapability('tasks.assign'),
  async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, staffId } = req.params as { shopId: string; staffId: string };

    const schema = z.object({
      assignmentDate: z.string().min(1).transform((v) => v.split('T')[0]),
      workflowProfileId: z.string().min(1),
      serviceTypeId: z.string().nullable().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
      orderId: z.string().min(1).max(250).optional(),
      pieceCount: z.number().int().positive().optional(),
      pickupCount: z.number().int().positive().optional(),
      customerMobile: z.string().max(20).optional(),
      selectedActivities: z.array(z.string().min(1)).default([]),
      notes: z.string().max(2000).optional(),
      idempotencyKey: z.string().min(1).max(200),
      initialDamage: z
        .object({
          hasDamage: z.boolean(),
          notes: z.string().max(2000).optional(),
          photoPath: z.string().optional(),
          pieceNumber: z.number().int().positive().optional(),
        })
        .optional(),
    });

    const body = schema.parse(req.body);
    const { dbDate } = dbDateForDay(body.assignmentDate);

    const assignment = await createAssignment({
      shopId,
      staffMemberId: staffId,
      createdByAccountId: auth.accountId,
      assignmentDate: dbDate,
      workflowProfileId: body.workflowProfileId,
      serviceTypeId: body.serviceTypeId,
      orderId: body.orderId,
      pieceCount: body.pieceCount,
      pickupCount: body.pickupCount,
      customerMobile: body.customerMobile,
      selectedActivities: body.selectedActivities,
      notes: body.notes,
      idempotencyKey: body.idempotencyKey,
      initialDamage: body.initialDamage,
    });

    res.status(201).json(assignment);
  }
);

// PATCH /api/shops/:shopId/task-units/:unitId/complete — Staff or Manager/Supervisor completes a unit
taskRouter.patch(
  '/shops/:shopId/task-units/:unitId/complete',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, unitId } = req.params as { shopId: string; unitId: string };

    // Find the staff member linked to this account in this shop
    const membership = await prisma.shopMembership.findFirst({
      where: { accountId: auth.accountId, shopId, isActive: true },
      select: { staffMemberId: true },
    });

    const isPrivileged = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && (m.capabilities.includes('tasks.assign') || m.capabilities.includes('tasks.read_team'))
    );

    if (!membership && !auth.isOwner) {
      return next(new AppError(403, 'FORBIDDEN', 'No active membership in this shop.'));
    }

    const staffMemberId = membership?.staffMemberId || '';
    await completeTaskUnit(unitId, staffMemberId, shopId, auth.accountId, !!isPrivileged);
    res.json({ message: 'Task unit completed.' });
  }
);

// PATCH /api/shops/:shopId/task-units/:unitId/toggle — Staff or Manager/Supervisor toggles between PENDING and COMPLETED
taskRouter.patch(
  '/shops/:shopId/task-units/:unitId/toggle',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, unitId } = req.params as { shopId: string; unitId: string };

    const membership = await prisma.shopMembership.findFirst({
      where: { accountId: auth.accountId, shopId, isActive: true },
      select: { staffMemberId: true },
    });

    const isPrivileged = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && (m.capabilities.includes('tasks.assign') || m.capabilities.includes('tasks.read_team'))
    );

    if (!membership && !auth.isOwner) {
      return next(new AppError(403, 'FORBIDDEN', 'No active membership in this shop.'));
    }

    const staffMemberId = membership?.staffMemberId || '';
    const updated = await toggleTaskUnit(unitId, staffMemberId, shopId, auth.accountId, !!isPrivileged);
    res.json({ message: `Task marked as ${updated.status.toLowerCase()}.`, unit: updated });
  }
);

// GET /api/shops/:shopId/staff/:staffId/task-summary?date=YYYY-MM-DD
taskRouter.get(
  '/shops/:shopId/staff/:staffId/task-summary',
  async (req: Request, res: Response) => {
    const { shopId, staffId } = req.params as { shopId: string; staffId: string };
    const dateStr = req.query['date'] as string;
    const date = dateStr ? new Date(dateStr) : new Date();
    const summary = await getTaskSummary(staffId, shopId, date);
    res.json(summary);
  }
);

// GET /api/shops/:shopId/staff/:staffId/task-summary/monthly?year=YYYY&month=M
taskRouter.get(
  '/shops/:shopId/staff/:staffId/task-summary/monthly',
  async (req: Request, res: Response, next: NextFunction) => {
    const { shopId, staffId } = req.params as { shopId: string; staffId: string };
    const year = parseInt(req.query['year'] as string);
    const month = parseInt(req.query['month'] as string);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return next(new AppError(422, 'VALIDATION_ERROR', 'Invalid year or month.'));
    }

    const summary = await getMonthlyTaskSummary(staffId, shopId, year, month);
    res.json(summary);
  }
);
