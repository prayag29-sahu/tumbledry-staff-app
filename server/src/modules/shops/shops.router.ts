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
  async (req: Request, res: Response) => {
    const { shopId } = req.params as { shopId: string };
    const schema = z.object({
      name: z.string().min(1).max(200).optional(),
      timezone: z.string().optional(),
      address: z.string().max(500).nullable().optional(),
      contactInfo: z.string().max(500).nullable().optional(),
      status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
    });
    const body = schema.parse(req.body);
    const shop = await prisma.shop.update({ where: { id: shopId }, data: body });
    res.json(shop);
  }
);
