import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest, requireOwner } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';

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

// POST /api/shops — Owner only
shopsRouter.post(
  '/',
  requireOwner as unknown as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response, next: NextFunction) => {
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
    res.json(shop);
  }
);

// DELETE /api/shops/:shopId — Owner only
shopsRouter.delete(
  '/:shopId',
  requireOwner as unknown as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response, next: NextFunction) => {
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

    res.json({ action: 'DELETED', message: 'Shop deleted successfully.' });
  }
);
