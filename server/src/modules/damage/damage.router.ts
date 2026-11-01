import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';
import { uploadToSupabaseStorageIfConfigured } from '../../lib/storage';
import { logger } from '../../config/logger';

export const damageRouter = Router();
damageRouter.use(authenticate as unknown as (req: Request, res: Response, next: NextFunction) => void);

// POST /api/shops/:shopId/damage — Report a damage incident
damageRouter.post(
  '/shops/:shopId/damage',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    const schema = z.object({
      taskAssignmentId: z.string().uuid(),
      taskUnitId: z.string().uuid().optional(),
      pieceNumber: z.number().int().positive().optional(),
      notes: z.string().max(2000).optional(),
      photoPath: z.string().optional(),
    });

    const body = schema.parse(req.body);

    // Validate the assignment belongs to this shop and the reporting staff member
    const membership = await prisma.shopMembership.findFirst({
      where: { accountId: auth.accountId, shopId, isActive: true },
      select: { staffMemberId: true },
    });
    if (!membership && !auth.isOwner) return next(new AppError(403, 'FORBIDDEN', 'No active membership.'));

    const staffMemberId = membership?.staffMemberId;

    const assignment = await prisma.taskAssignment.findFirst({
      where: {
        id: body.taskAssignmentId,
        shopId,
        ...(staffMemberId ? { staffMemberId } : {}),
      },
    });
    if (!assignment) return next(new AppError(404, 'NOT_FOUND', 'Assignment not found.'));

    let targetUnitId = body.taskUnitId;
    if (!targetUnitId && body.pieceNumber) {
      const unit = await prisma.taskUnit.findFirst({
        where: {
          taskAssignmentId: body.taskAssignmentId,
          pieceNumber: body.pieceNumber,
        },
        select: { id: true },
      });
      if (unit) targetUnitId = unit.id;
    }

    const storedPhotoPath = await uploadToSupabaseStorageIfConfigured(
      body.photoPath,
      'damage',
      `damage_${shopId}`
    );

    const incident = await prisma.damageIncident.create({
      data: {
        shopId,
        staffMemberId: assignment.staffMemberId,
        taskAssignmentId: body.taskAssignmentId,
        taskUnitId: targetUnitId ?? null,
        pieceNumber: body.pieceNumber ?? null,
        reportedByAccountId: auth.accountId,
        notes: body.notes ?? null,
        photoPath: storedPhotoPath ?? null,
      },
      include: {
        staffMember: { select: { id: true, fullName: true } },
        taskAssignment: {
          select: {
            id: true,
            orderId: true,
            assignmentDate: true,
            serviceType: { select: { name: true } },
          },
        },
      },
    });

    res.status(201).json({
      incidentId: incident.id,
      incident,
      message: 'Damage incident recorded.',
    });
  }
);

// GET /api/shops/:shopId/damage — List incidents for a shop
damageRouter.get(
  '/shops/:shopId/damage',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    const hasAccess = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && (m.capabilities.includes('damage.read') || m.capabilities.includes('tasks.read_team'))
    );
    if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));

    const { staffId, status, from, to } = req.query as Record<string, string>;

    const incidents = await prisma.damageIncident.findMany({
      where: {
        shopId,
        ...(staffId ? { staffMemberId: staffId } : {}),
        ...(status ? { status: status as 'OPEN' | 'UNDER_REVIEW' | 'CLOSED' | 'DISPUTED' } : {}),
        ...(from || to ? {
          reportedAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        } : {}),
      },
      include: {
        staffMember: { select: { id: true, fullName: true } },
        taskAssignment: {
          select: {
            id: true,
            orderId: true,
            assignmentDate: true,
            serviceType: { select: { name: true } },
          },
        },
      },
      orderBy: { reportedAt: 'desc' },
      take: 100,
    });

    res.json({ incidents });
  }
);

// PATCH /api/shops/:shopId/damage/:incidentId — Update incident status/resolution
damageRouter.patch(
  '/shops/:shopId/damage/:incidentId',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, incidentId } = req.params as { shopId: string; incidentId: string };

    const hasAccess = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && (m.capabilities.includes('damage.read') || m.capabilities.includes('tasks.assign') || m.capabilities.includes('damage.manage'))
    );
    if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Permission denied.'));

    const schema = z.object({
      status: z.enum(['OPEN', 'UNDER_REVIEW', 'CLOSED', 'DISPUTED']),
      resolutionNotes: z.string().max(1000).optional(),
      reviewNotes: z.string().max(1000).optional(),
      photoPath: z.string().optional(),
    });
    const body = schema.parse(req.body);

    const reviewNotes = body.reviewNotes ?? body.resolutionNotes ?? null;

    const updated = await prisma.damageIncident.update({
      where: { id: incidentId },
      data: {
        status: body.status,
        ...(reviewNotes !== null ? { reviewNotes } : {}),
        ...(body.photoPath !== undefined ? { photoPath: body.photoPath } : {}),
        reviewedByAccountId: auth.accountId,
        reviewedAt: new Date(),
      },
    });

    res.json({ incident: updated, message: 'Damage status updated.' });
  }
);

// ─────────────────────────────────────────────
// SPECIAL DAMAGE ORDERS ENDPOINTS
// ─────────────────────────────────────────────

function checkSpecialDamageAccess(auth: AuthenticatedRequest['auth'], shopId: string, isWrite = false): boolean {
  if (auth.isOwner) return true;
  return auth.shopMemberships.some((m) => {
    if (m.shopId !== shopId) return false;
    if (isWrite) {
      return (
        m.capabilities.includes('damage.report') ||
        m.capabilities.includes('damage.manage') ||
        m.capabilities.includes('tasks.assign') ||
        m.capabilities.includes('attendance.read_team')
      );
    }
    return (
      m.capabilities.includes('damage.read') ||
      m.capabilities.includes('damage.report') ||
      m.capabilities.includes('damage.manage') ||
      m.capabilities.includes('tasks.assign') ||
      m.capabilities.includes('tasks.read_team') ||
      m.capabilities.includes('attendance.read_team') ||
      m.capabilities.includes('staff.read')
    );
  });
}

// POST /api/shops/:shopId/special-damage-orders — Record a new special damage order
damageRouter.post(
  '/shops/:shopId/special-damage-orders',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    if (!checkSpecialDamageAccess(auth, shopId, true)) {
      return next(new AppError(403, 'FORBIDDEN', 'Permission denied to record special damage orders.'));
    }

    const schema = z.object({
      orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Order date must be YYYY-MM-DD'),
      orderId: z.string().min(1, 'Order ID is required').max(50),
      totalAmount: z.number().nonnegative('Total amount must be positive').default(0),
      serviceType: z.string().min(1, 'Service type is required').max(100),
      piecesCount: z.number().int().positive('Pieces count must be at least 1').default(1),
      returnPiecesCount: z.number().int().nonnegative('Return pieces count cannot be negative').default(0),
      returnReason: z.string().max(2000).optional().nullable(),
      damageReason: z.string().max(2000).optional().nullable(),
      returnAmount: z.number().nonnegative('Return amount cannot be negative').default(0),
      finalBillingAmount: z.number().nonnegative('Final billing amount cannot be negative').default(0),
      photos: z.array(z.string()).max(10, 'Maximum 10 photos allowed').default([]),
      notes: z.string().max(2000).optional().nullable(),
      status: z.string().max(50).default('LOGGED'),
    });

    const body = schema.parse(req.body);

    // Process and store up to 10 photos
    const storedPhotos: string[] = [];
    for (let i = 0; i < body.photos.length; i++) {
      const photo = body.photos[i];
      if (photo && photo.trim().length > 0) {
        try {
          const stored = await uploadToSupabaseStorageIfConfigured(
            photo,
            'damage',
            `dmg_ord_${shopId}_${body.orderId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${i + 1}`
          );
          if (stored) {
            storedPhotos.push(stored);
          }
        } catch (uploadErr) {
          logger.warn('[SPECIAL_DAMAGE_ORDERS] Photo upload failed, using fallback', {
            error: uploadErr instanceof Error ? uploadErr.message : uploadErr,
            index: i,
          });
          storedPhotos.push(photo);
        }
      }
    }

    const order = await prisma.specialDamageOrder.create({
      data: {
        shopId,
        orderDate: body.orderDate,
        orderId: body.orderId.trim(),
        totalAmount: body.totalAmount,
        serviceType: body.serviceType.trim(),
        piecesCount: body.piecesCount,
        returnPiecesCount: body.returnPiecesCount,
        returnReason: body.returnReason?.trim() || null,
        damageReason: body.damageReason?.trim() || null,
        returnAmount: body.returnAmount,
        finalBillingAmount: body.finalBillingAmount,
        photos: storedPhotos,
        reportedByAccountId: auth.accountId,
        status: body.status,
        notes: body.notes?.trim() || null,
      },
      include: {
        reportedByAccount: {
          select: {
            id: true,
            username: true,
            staffMember: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    logger.info('[SPECIAL_DAMAGE_ORDERS] Created special damage order', {
      shopId,
      orderId: order.orderId,
      recordId: order.id,
      photosCount: storedPhotos.length,
      totalAmount: order.totalAmount,
      returnAmount: order.returnAmount,
      finalBillingAmount: order.finalBillingAmount,
      accountId: auth.accountId,
    });

    res.status(201).json({
      order,
      message: 'Special damage order recorded successfully.',
    });
  }
);

// GET /api/shops/:shopId/special-damage-orders — List damage orders with monthly/date filtering
damageRouter.get(
  '/shops/:shopId/special-damage-orders',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    if (!checkSpecialDamageAccess(auth, shopId, false)) {
      return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));
    }

    const { month, year, orderDate, from, to, search } = req.query as Record<string, string>;

    const whereClause: any = { shopId };

    if (orderDate) {
      whereClause.orderDate = orderDate;
    } else if (from || to) {
      whereClause.orderDate = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    } else if (month && year) {
      const paddedMonth = String(month).padStart(2, '0');
      const prefix = `${year}-${paddedMonth}`;
      whereClause.orderDate = { startsWith: prefix };
    } else if (month && String(month).includes('-')) {
      whereClause.orderDate = { startsWith: String(month) };
    }

    if (search && search.trim().length > 0) {
      const q = search.trim();
      whereClause.OR = [
        { orderId: { contains: q, mode: 'insensitive' } },
        { serviceType: { contains: q, mode: 'insensitive' } },
        { returnReason: { contains: q, mode: 'insensitive' } },
        { damageReason: { contains: q, mode: 'insensitive' } },
      ];
    }

    const orders = await prisma.specialDamageOrder.findMany({
      where: whereClause,
      include: {
        reportedByAccount: {
          select: {
            id: true,
            username: true,
            staffMember: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
      orderBy: [
        { orderDate: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    const totalOrders = orders.length;
    const totalPieces = orders.reduce((sum, o) => sum + (o.piecesCount || 0), 0);
    const totalReturnPieces = orders.reduce((sum, o) => sum + (o.returnPiecesCount || 0), 0);
    const totalAmountSum = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalReturnAmountSum = orders.reduce((sum, o) => sum + (o.returnAmount || 0), 0);
    const totalFinalBillingSum = orders.reduce((sum, o) => sum + (o.finalBillingAmount || 0), 0);

    logger.info('[SPECIAL_DAMAGE_ORDERS] Listed special damage orders', {
      shopId,
      count: orders.length,
      requesterAccountId: auth.accountId,
      month: month || null,
      year: year || null,
      search: search || null,
    });

    res.json({
      orders,
      summary: {
        totalOrders,
        totalPieces,
        totalReturnPieces,
        totalAmountSum,
        totalReturnAmountSum,
        totalFinalBillingSum,
      },
    });
  }
);

// DELETE /api/shops/:shopId/special-damage-orders/:id — Delete a special damage order
damageRouter.delete(
  '/shops/:shopId/special-damage-orders/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, id } = req.params as { shopId: string; id: string };

    if (!checkSpecialDamageAccess(auth, shopId, true)) {
      return next(new AppError(403, 'FORBIDDEN', 'Permission denied to delete damage order.'));
    }

    const existing = await prisma.specialDamageOrder.findFirst({
      where: { id, shopId },
    });

    if (!existing) {
      return next(new AppError(404, 'NOT_FOUND', 'Damage order not found.'));
    }

    await prisma.specialDamageOrder.delete({
      where: { id },
    });

    logger.info('[SPECIAL_DAMAGE_ORDERS] Deleted special damage order', {
      shopId,
      orderId: existing.orderId,
      id,
      deletedByAccountId: auth.accountId,
    });

    res.json({ success: true, message: 'Damage order deleted successfully.' });
  }
);
