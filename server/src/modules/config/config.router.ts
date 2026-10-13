import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOwner, AuthenticatedRequest } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../lib/audit';

export const configRouter = Router();
configRouter.use(authenticate as unknown as (req: Request, res: Response, next: NextFunction) => void);

// ─── PERMISSION PROFILES ──────────────────────────────────────────────────────

// GET /api/config/permission-profiles
configRouter.get('/permission-profiles', requireOwner as unknown as (req: Request, res: Response, next: NextFunction) => void, async (_req, res) => {
  const profiles = await prisma.permissionProfile.findMany({
    include: { capabilities: true },
    orderBy: { name: 'asc' },
  });
  res.json({ profiles });
});

// POST /api/config/permission-profiles
configRouter.post('/permission-profiles', requireOwner as unknown as (req: Request, res: Response, next: NextFunction) => void, async (req: Request, res: Response) => {
  const schema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    capabilities: z.array(z.string().min(1)),
  });
  const body = schema.parse(req.body);
  const profile = await prisma.$transaction(async (tx) => {
    const p = await tx.permissionProfile.create({ data: { name: body.name, description: body.description } });
    await tx.permissionProfileCapability.createMany({
      data: body.capabilities.map((cap) => ({ permissionProfileId: p.id, capability: cap })),
    });
    return tx.permissionProfile.findUniqueOrThrow({ where: { id: p.id }, include: { capabilities: true } });
  });
  res.status(201).json(profile);
});

// ─── POSITION CATEGORIES ──────────────────────────────────────────────────────

// GET /api/config/shops/:shopId/position-categories
configRouter.get('/shops/:shopId/position-categories', async (req: Request, res: Response, next: NextFunction) => {
  const auth = (req as AuthenticatedRequest).auth;
  const { shopId } = req.params as { shopId: string };
  const hasAccess = auth.isOwner || auth.shopMemberships.some((m) => m.shopId === shopId);
  if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));

  const categories = await prisma.positionCategory.findMany({
    where: { OR: [{ shopId }, { shopId: null }], isActive: true },
    include: { workflowProfile: { select: { id: true, name: true, workflowType: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({ categories });
});

// POST /api/config/shops/:shopId/position-categories
configRouter.post('/shops/:shopId/position-categories', async (req: Request, res: Response, next: NextFunction) => {
  const auth = (req as AuthenticatedRequest).auth;
  const { shopId } = req.params as { shopId: string };
  const hasAccess = auth.isOwner || auth.shopMemberships.some(
    (m) => m.shopId === shopId && m.capabilities.includes('custom_fields.manage')
  );
  if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Permission denied.'));

  const schema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(300).optional(),
    workflowProfileId: z.string().uuid().optional(),
  });
  const body = schema.parse(req.body);
  const category = await prisma.positionCategory.create({
    data: { ...body, shopId },
  });
  res.status(201).json(category);
});

// ─── WORKFLOW PROFILES ────────────────────────────────────────────────────────

// GET /api/config/workflow-profiles
configRouter.get('/workflow-profiles', async (_req, res) => {
  const profiles = await prisma.workflowProfile.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  res.json({ profiles });
});

// ─── SERVICE CATALOGUE ────────────────────────────────────────────────────────

// GET /api/config/service-types
configRouter.get('/service-types', async (_req, res) => {
  const serviceTypes = await prisma.serviceType.findMany({
    where: { isActive: true },
    include: {
      activityMappings: {
        where: { isActive: true },
        include: { activityType: { select: { id: true, name: true, code: true } } },
      },
    },
    orderBy: { displayOrder: 'asc' },
  });
  res.json({ serviceTypes });
});

// ─── ACTIVITY CATALOGUE ───────────────────────────────────────────────────────

// GET /api/config/activity-types
configRouter.get('/activity-types', async (_req, res) => {
  const activityTypes = await prisma.activityType.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
  });
  res.json({ activityTypes });
});

// ─── CUSTOM FIELD DEFINITIONS ─────────────────────────────────────────────────

// GET /api/config/shops/:shopId/custom-fields
configRouter.get('/shops/:shopId/custom-fields', async (req: Request, res: Response, next: NextFunction) => {
  const auth = (req as AuthenticatedRequest).auth;
  const { shopId } = req.params as { shopId: string };
  const hasAccess = auth.isOwner || auth.shopMemberships.some((m) => m.shopId === shopId);
  if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));

  const fields = await prisma.customFieldDefinition.findMany({
    where: { OR: [{ shopId }, { shopId: null }], isActive: true },
    orderBy: { displayOrder: 'asc' },
  });
  res.json({ fields });
});

// POST /api/config/shops/:shopId/custom-fields
configRouter.post('/shops/:shopId/custom-fields', async (req: Request, res: Response, next: NextFunction) => {
  const auth = (req as AuthenticatedRequest).auth;
  const { shopId } = req.params as { shopId: string };
  const hasAccess = auth.isOwner || auth.shopMemberships.some(
    (m) => m.shopId === shopId && m.capabilities.includes('custom_fields.manage')
  );
  if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Permission denied.'));

  const schema = z.object({
    key: z.string().min(1).max(100).regex(/^[a-z_]+$/),
    label: z.string().min(1).max(100),
    helpText: z.string().max(300).optional(),
    fieldType: z.enum(['TEXT', 'NUMBER', 'DATE', 'FILE_IMAGE', 'DROPDOWN', 'YES_NO']),
    isRequired: z.boolean().default(false),
    displayOrder: z.number().int().default(0),
    dropdownOptions: z.array(z.string()).default([]),
  });

  const body = schema.parse(req.body);
  const field = await prisma.customFieldDefinition.create({
    data: { ...body, shopId },
  });

  logAudit({
    action: 'custom_field.created',
    entityType: 'CustomFieldDefinition',
    entityId: field.id,
    actorAccountId: auth.accountId,
    shopId,
    metadata: { key: field.key, label: field.label, fieldType: field.fieldType },
  });

  res.status(201).json(field);
});

// DELETE /api/config/shops/:shopId/custom-fields/:fieldId
configRouter.delete(
  '/shops/:shopId/custom-fields/:fieldId',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, fieldId } = req.params as { shopId: string; fieldId: string };
    const hasAccess = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && m.capabilities.includes('custom_fields.manage')
    );
    if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Permission denied.'));

    const field = await prisma.customFieldDefinition.findFirst({
      where: { id: fieldId, shopId },
    });
    if (!field) return next(new AppError(404, 'NOT_FOUND', 'Custom field not found.'));

    await prisma.customFieldDefinition.delete({ where: { id: fieldId } });

    logAudit({
      action: 'custom_field.deleted',
      entityType: 'CustomFieldDefinition',
      entityId: fieldId,
      actorAccountId: auth.accountId,
      shopId,
      metadata: { key: field.key, label: field.label },
    });

    res.json({ message: 'Custom field deleted successfully.' });
  }
);

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────

// GET /api/config/audit-logs — Owner only
configRouter.get(
  '/audit-logs',
  requireOwner as unknown as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const { shopId, limit = '50', page = '1' } = req.query as Record<string, string>;
    const take = Math.min(parseInt(limit) || 50, 100);
    const skip = ((parseInt(page) || 1) - 1) * take;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: shopId ? { shopId } : {},
        include: {
          shop: { select: { id: true, name: true, code: true } },
          actor: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.auditLog.count({
        where: shopId ? { shopId } : {},
      }),
    ]);

    res.json({ logs, total, page: parseInt(page) || 1, limit: take });
  }
);
