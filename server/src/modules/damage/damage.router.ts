import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';

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
      notes: z.string().max(500).optional(),
    });

    const body = schema.parse(req.body);

    // Validate the assignment belongs to this shop and the reporting staff member
    const membership = await prisma.shopMembership.findFirst({
      where: { accountId: auth.accountId, shopId, isActive: true },
      select: { staffMemberId: true },
    });
    if (!membership) return next(new AppError(403, 'FORBIDDEN', 'No active membership.'));

    const assignment = await prisma.taskAssignment.findFirst({
      where: { id: body.taskAssignmentId, shopId, staffMemberId: membership.staffMemberId },
    });
    if (!assignment) return next(new AppError(404, 'NOT_FOUND', 'Assignment not found.'));

    const incident = await prisma.damageIncident.create({
      data: {
        shopId,
        staffMemberId: membership.staffMemberId,
        taskAssignmentId: body.taskAssignmentId,
        taskUnitId: body.taskUnitId ?? null,
        pieceNumber: body.pieceNumber ?? null,
        reportedByAccountId: auth.accountId,
        notes: body.notes ?? null,
        // photoPath set after upload middleware (future)
      },
    });

    res.status(201).json({
      incidentId: incident.id,
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
      (m) => m.shopId === shopId && m.capabilities.includes('damage.read')
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
        taskAssignment: { select: { id: true, orderId: true, assignmentDate: true } },
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
      (m) => m.shopId === shopId && m.capabilities.includes('damage.manage')
    );
    if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Permission denied.'));

    const schema = z.object({
      status: z.enum(['OPEN', 'UNDER_REVIEW', 'CLOSED', 'DISPUTED']),
      resolutionNotes: z.string().max(500).optional(),
    });
    const body = schema.parse(req.body);

    const updated = await prisma.damageIncident.update({
      where: { id: incidentId },
      data: {
        status: body.status,
        ...(body.resolutionNotes ? { resolutionNotes: body.resolutionNotes } : {}),
      },
    });

    res.json({ incident: updated, message: 'Damage status updated.' });
  }
);
