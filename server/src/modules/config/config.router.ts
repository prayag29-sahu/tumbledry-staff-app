import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOwner, AuthenticatedRequest } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../lib/audit';

export const configRouter = Router();
configRouter.use(authenticate as unknown as (req: Request, res: Response, next: NextFunction) => void);

const ownerOnly = requireOwner as unknown as (req: Request, res: Response, next: NextFunction) => void;

// ─── CAPABILITY CATALOGUE ─────────────────────────────────────────────────────
// Single source of truth for every permission the backend actually checks.
export const CAPABILITY_CATALOGUE: Array<{ key: string; label: string; group: string }> = [
  { key: 'staff.read', label: 'View staff list & profiles', group: 'Staff' },
  { key: 'staff.create', label: 'Add new staff members', group: 'Staff' },
  { key: 'staff.update', label: 'Edit staff, reset passwords, mark attendance', group: 'Staff' },
  { key: 'staff.archive', label: 'Remove (archive) staff members', group: 'Staff' },
  { key: 'tasks.read_team', label: 'View tasks of the whole team', group: 'Tasks' },
  { key: 'tasks.assign', label: 'Assign tasks to staff', group: 'Tasks' },
  { key: 'tasks.read_self', label: 'View own assigned tasks', group: 'Tasks' },
  { key: 'tasks.complete', label: 'Mark own tasks as done', group: 'Tasks' },
  { key: 'attendance.self', label: 'Check in / check out with selfie', group: 'Attendance' },
  { key: 'attendance.read_team', label: 'View & mark team attendance', group: 'Attendance' },
  { key: 'damage.report', label: 'Report damaged clothes', group: 'Damage' },
  { key: 'damage.read', label: 'View damage reports', group: 'Damage' },
  { key: 'custom_fields.manage', label: 'Manage custom fields & job roles', group: 'Settings' },
  { key: 'reports.read', label: 'View shop dashboard & reports', group: 'Reports' },
];
const VALID_CAPABILITIES = new Set(CAPABILITY_CATALOGUE.map((c) => c.key));

// GET /api/config/capabilities — Owner only
configRouter.get('/capabilities', ownerOnly, (_req, res) => {
  res.json({ capabilities: CAPABILITY_CATALOGUE });
});

// Custom field scope helpers (stored as JSON in visibility_scope)
function parseScope(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { positionCategoryIds?: unknown };
    return Array.isArray(parsed.positionCategoryIds) ? parsed.positionCategoryIds.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function serializeScope(ids: string[] | undefined): string | null {
  return ids && ids.length > 0 ? JSON.stringify({ positionCategoryIds: ids }) : null;
}

// ─── PERMISSION PROFILES ──────────────────────────────────────────────────────

// GET /api/config/permission-profiles — Owner only (all profiles + capabilities)
configRouter.get('/permission-profiles', requireOwner as unknown as (req: Request, res: Response, next: NextFunction) => void, async (_req, res) => {
  const profiles = await prisma.permissionProfile.findMany({
    include: { capabilities: true },
    orderBy: { name: 'asc' },
  });
  res.json({ profiles });
});

// GET /api/config/shops/:shopId/permission-profiles
// Accessible to Supervisors — returns assignable (non-owner) permission profiles
configRouter.get('/shops/:shopId/permission-profiles', async (req: Request, res: Response, next: NextFunction) => {
  const auth = (req as AuthenticatedRequest).auth;
  const { shopId } = req.params as { shopId: string };
  const hasAccess = auth.isOwner || auth.shopMemberships.some(
    (m) => m.shopId === shopId && m.capabilities.includes('staff.create')
  );
  if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));

  // Return all system permission profiles except the owner-level ones
  // Supervisor can assign: Manager, Washerman, Ironman, Delivery Boy, etc.
  const profiles = await prisma.permissionProfile.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  // Filter out internal system roles that cannot be delegated
  const UNDELEGATABLE = ['sys-owner'];
  const assignable = profiles.filter((p) => !UNDELEGATABLE.includes(p.id));
  res.json({ profiles: assignable });
});

// POST /api/config/permission-profiles
configRouter.post('/permission-profiles', requireOwner as unknown as (req: Request, res: Response, next: NextFunction) => void, async (req: Request, res: Response) => {
  const schema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    capabilities: z.array(z.string().min(1)),
  });
  const body = schema.parse(req.body);
  const invalid = body.capabilities.filter((c) => !VALID_CAPABILITIES.has(c));
  if (invalid.length) throw new AppError(400, 'VALIDATION_ERROR', `Unknown permissions: ${invalid.join(', ')}`);
  const auth = (req as AuthenticatedRequest).auth;
  const profile = await prisma.$transaction(async (tx) => {
    const p = await tx.permissionProfile.create({ data: { name: body.name, description: body.description } });
    await tx.permissionProfileCapability.createMany({
      data: body.capabilities.map((cap) => ({ permissionProfileId: p.id, capability: cap })),
    });
    return tx.permissionProfile.findUniqueOrThrow({ where: { id: p.id }, include: { capabilities: true } });
  });
  await logAudit({
    action: 'permission_profile.created',
    entityType: 'PermissionProfile',
    entityId: profile.id,
    actorAccountId: auth.accountId,
    metadata: { name: profile.name, capabilities: body.capabilities },
  });
  res.status(201).json(profile);
});

// PATCH /api/config/permission-profiles/:id — Owner edits name / permissions
configRouter.patch('/permission-profiles/:id', ownerOnly, async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params as { id: string };
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    capabilities: z.array(z.string().min(1)).optional(),
  });
  const body = schema.parse(req.body);
  const existing = await prisma.permissionProfile.findUnique({ where: { id } });
  if (!existing) return next(new AppError(404, 'NOT_FOUND', 'Access level not found.'));
  if (existing.isOwnerOnly) return next(new AppError(403, 'FORBIDDEN', 'Owner access level cannot be edited.'));
  if (body.capabilities) {
    const invalid = body.capabilities.filter((c) => !VALID_CAPABILITIES.has(c));
    if (invalid.length) return next(new AppError(400, 'VALIDATION_ERROR', `Unknown permissions: ${invalid.join(', ')}`));
  }
  const auth = (req as AuthenticatedRequest).auth;
  const profile = await prisma.$transaction(async (tx) => {
    await tx.permissionProfile.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
    });
    if (body.capabilities) {
      await tx.permissionProfileCapability.deleteMany({ where: { permissionProfileId: id } });
      if (body.capabilities.length) {
        await tx.permissionProfileCapability.createMany({
          data: body.capabilities.map((cap) => ({ permissionProfileId: id, capability: cap })),
        });
      }
    }
    return tx.permissionProfile.findUniqueOrThrow({ where: { id }, include: { capabilities: true } });
  });
  await logAudit({
    action: 'permission_profile.updated',
    entityType: 'PermissionProfile',
    entityId: id,
    actorAccountId: auth.accountId,
    metadata: { name: profile.name, capabilities: profile.capabilities.map((c) => c.capability) },
  });
  res.json(profile);
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
    workflowProfileId: z.string().optional(),
  });
  const body = schema.parse(req.body);
  const duplicate = await prisma.positionCategory.findFirst({
    where: { name: { equals: body.name.trim(), mode: 'insensitive' }, isActive: true, OR: [{ shopId }, { shopId: null }] },
  });
  if (duplicate) return next(new AppError(409, 'CONFLICT', `A job role named "${body.name}" already exists.`));
  const category = await prisma.positionCategory.create({
    data: { name: body.name.trim(), description: body.description, workflowProfileId: body.workflowProfileId || null, shopId },
  });
  await logAudit({
    action: 'position_category.created',
    entityType: 'PositionCategory',
    entityId: category.id,
    actorAccountId: auth.accountId,
    shopId,
    metadata: { name: category.name, workflowProfileId: category.workflowProfileId },
  });
  res.status(201).json(category);
});

// PATCH /api/config/shops/:shopId/position-categories/:id — Owner renames / deactivates a job role
configRouter.patch('/shops/:shopId/position-categories/:id', ownerOnly, async (req: Request, res: Response, next: NextFunction) => {
  const auth = (req as AuthenticatedRequest).auth;
  const { shopId, id } = req.params as { shopId: string; id: string };
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(300).nullable().optional(),
    workflowProfileId: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  });
  const body = schema.parse(req.body);
  const existing = await prisma.positionCategory.findFirst({ where: { id, OR: [{ shopId }, { shopId: null }] } });
  if (!existing) return next(new AppError(404, 'NOT_FOUND', 'Job role not found.'));
  if (body.isActive === false) {
    const inUse = await prisma.shopMembership.count({ where: { positionCategoryId: id, isActive: true } });
    if (inUse > 0) {
      return next(new AppError(409, 'CONFLICT', `${inUse} active staff still have this job role. Change their role first.`));
    }
  }
  const updated = await prisma.positionCategory.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.workflowProfileId !== undefined ? { workflowProfileId: body.workflowProfileId || null } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });
  await logAudit({
    action: body.isActive === false ? 'position_category.deactivated' : 'position_category.updated',
    entityType: 'PositionCategory',
    entityId: id,
    actorAccountId: auth.accountId,
    shopId,
    metadata: { name: updated.name, changedFields: Object.keys(body) },
  });
  res.json(updated);
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

// GET /api/config/service-types  (?includeInactive=1 — Owner only, for catalogue management)
configRouter.get('/service-types', async (req: Request, res: Response) => {
  const auth = (req as AuthenticatedRequest).auth;
  const includeInactive = auth.isOwner && req.query['includeInactive'] === '1';
  const serviceTypes = await prisma.serviceType.findMany({
    where: includeInactive ? {} : { isActive: true },
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

async function syncServiceActivities(serviceTypeId: string, activityCodes: string[]) {
  const activities = await prisma.activityType.findMany({ where: { code: { in: activityCodes }, isActive: true } });
  await prisma.$transaction([
    prisma.serviceActivityMapping.deleteMany({ where: { serviceTypeId } }),
    prisma.serviceActivityMapping.createMany({
      data: activities.map((a) => ({ serviceTypeId, activityTypeId: a.id })),
    }),
  ]);
}

// POST /api/config/service-types — Owner adds a new service
configRouter.post('/service-types', ownerOnly, async (req: Request, res: Response, next: NextFunction) => {
  const auth = (req as AuthenticatedRequest).auth;
  const schema = z.object({
    name: z.string().min(1).max(100),
    code: z.string().min(1).max(20).regex(/^[A-Za-z0-9_]+$/, 'Code may contain only letters, numbers and _'),
    displayOrder: z.number().int().min(0).optional(),
    activityCodes: z.array(z.string()).default([]),
  });
  const body = schema.parse(req.body);
  const code = body.code.toUpperCase();
  if (await prisma.serviceType.findUnique({ where: { code } })) {
    return next(new AppError(409, 'CONFLICT', `Service code "${code}" already exists.`));
  }
  const maxOrder = await prisma.serviceType.aggregate({ _max: { displayOrder: true } });
  const service = await prisma.serviceType.create({
    data: { name: body.name.trim(), code, displayOrder: body.displayOrder ?? (maxOrder._max.displayOrder ?? 0) + 1 },
  });
  if (body.activityCodes.length) await syncServiceActivities(service.id, body.activityCodes);
  await logAudit({
    action: 'service_type.created',
    entityType: 'ServiceType',
    entityId: service.id,
    actorAccountId: auth.accountId,
    metadata: { name: service.name, code, activityCodes: body.activityCodes },
  });
  res.status(201).json(service);
});

// PATCH /api/config/service-types/:id — Owner renames / enables / disables a service
configRouter.patch('/service-types/:id', ownerOnly, async (req: Request, res: Response, next: NextFunction) => {
  const auth = (req as AuthenticatedRequest).auth;
  const { id } = req.params as { id: string };
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    displayOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
    activityCodes: z.array(z.string()).optional(),
  });
  const body = schema.parse(req.body);
  const existing = await prisma.serviceType.findUnique({ where: { id } });
  if (!existing) return next(new AppError(404, 'NOT_FOUND', 'Service not found.'));
  const service = await prisma.serviceType.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name.trim() } : {}),
      ...(body.displayOrder !== undefined ? { displayOrder: body.displayOrder } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });
  if (body.activityCodes) await syncServiceActivities(id, body.activityCodes);
  await logAudit({
    action: body.isActive === false ? 'service_type.disabled' : body.isActive === true ? 'service_type.enabled' : 'service_type.updated',
    entityType: 'ServiceType',
    entityId: id,
    actorAccountId: auth.accountId,
    metadata: { name: service.name, code: service.code, changedFields: Object.keys(body) },
  });
  res.json(service);
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

  // Optional filter: only fields that apply to a given job role (empty scope = all staff)
  const positionCategoryId = req.query['positionCategoryId'] as string | undefined;
  const enriched = fields.map((f) => ({ ...f, positionCategoryIds: parseScope(f.visibilityScope) }));
  const filtered = positionCategoryId
    ? enriched.filter((f) => f.positionCategoryIds.length === 0 || f.positionCategoryIds.includes(positionCategoryId))
    : enriched;
  res.json({ fields: filtered });
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
    positionCategoryIds: z.array(z.string()).default([]), // empty = applies to all staff
  });

  const { positionCategoryIds, ...body } = schema.parse(req.body);
  const dup = await prisma.customFieldDefinition.findFirst({ where: { shopId, key: body.key } });
  if (dup) return next(new AppError(409, 'CONFLICT', `A field with key "${body.key}" already exists in this shop.`));
  const field = await prisma.customFieldDefinition.create({
    data: { ...body, shopId, visibilityScope: serializeScope(positionCategoryIds) },
  });

  await logAudit({
    action: 'custom_field.created',
    entityType: 'CustomFieldDefinition',
    entityId: field.id,
    actorAccountId: auth.accountId,
    shopId,
    metadata: { key: field.key, label: field.label, fieldType: field.fieldType, positionCategoryIds },
  });

  res.status(201).json({ ...field, positionCategoryIds });
});

// PATCH /api/config/shops/:shopId/custom-fields/:fieldId — edit label / required / who it applies to
configRouter.patch('/shops/:shopId/custom-fields/:fieldId', async (req: Request, res: Response, next: NextFunction) => {
  const auth = (req as AuthenticatedRequest).auth;
  const { shopId, fieldId } = req.params as { shopId: string; fieldId: string };
  const hasAccess = auth.isOwner || auth.shopMemberships.some(
    (m) => m.shopId === shopId && m.capabilities.includes('custom_fields.manage')
  );
  if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Permission denied.'));
  const schema = z.object({
    label: z.string().min(1).max(100).optional(),
    helpText: z.string().max(300).nullable().optional(),
    isRequired: z.boolean().optional(),
    dropdownOptions: z.array(z.string()).optional(),
    positionCategoryIds: z.array(z.string()).optional(),
  });
  const { positionCategoryIds, ...body } = schema.parse(req.body);
  const field = await prisma.customFieldDefinition.findFirst({ where: { id: fieldId, shopId } });
  if (!field) return next(new AppError(404, 'NOT_FOUND', 'Custom field not found.'));
  const updated = await prisma.customFieldDefinition.update({
    where: { id: fieldId },
    data: {
      ...body,
      ...(positionCategoryIds !== undefined ? { visibilityScope: serializeScope(positionCategoryIds) } : {}),
    },
  });
  await logAudit({
    action: 'custom_field.updated',
    entityType: 'CustomFieldDefinition',
    entityId: fieldId,
    actorAccountId: auth.accountId,
    shopId,
    metadata: { key: updated.key, changedFields: Object.keys(req.body ?? {}) },
  });
  res.json({ ...updated, positionCategoryIds: parseScope(updated.visibilityScope) });
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

    await logAudit({
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
