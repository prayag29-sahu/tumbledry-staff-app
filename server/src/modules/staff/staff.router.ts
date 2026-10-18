import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';
import { hashPassword } from '../auth/auth.service';
import { logAudit } from '../../lib/audit';

export const staffRouter = Router();

staffRouter.use(authenticate as unknown as (req: Request, res: Response, next: NextFunction) => void);

// ─── GET /api/shops/:shopId/staff ───────────────────────────────────────────
staffRouter.get(
  '/shops/:shopId/staff',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    const hasAccess = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && m.capabilities.includes('staff.read')
    );
    if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));

    const { search, status, positionCategoryId, page = '1', limit = '50' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const memberships = await prisma.shopMembership.findMany({
      where: {
        shopId,
        isActive: status !== 'inactive',
        ...(positionCategoryId ? { positionCategoryId } : {}),
        ...(search
          ? {
              staffMember: {
                OR: [
                  { fullName: { contains: search, mode: 'insensitive' } },
                  { mobile: { contains: search } },
                  { account: { username: { contains: search, mode: 'insensitive' } } },
                ],
              },
            }
          : {}),
      },
      include: {
        staffMember: {
          select: {
            id: true,
            fullName: true,
            mobile: true,
            address: true,
            profilePhotoPath: true,
            employmentStatus: true,
            customFieldValues: {
              include: {
                customFieldDefinition: { select: { id: true, label: true, key: true } },
              },
            },
          },
        },
        positionCategory: { select: { id: true, name: true } },
        permissionProfile: { select: { id: true, name: true } },
        account: { select: { id: true, username: true, status: true } },
      },
      skip,
      take: parseInt(limit),
      orderBy: { staffMember: { fullName: 'asc' } },
    });

    const total = await prisma.shopMembership.count({
      where: { shopId, isActive: status !== 'inactive' },
    });

    // Fetch attendance sessions to attach presence status (supports ?date=YYYY-MM-DD)
    const dateStr = req.query['date'] as string;
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const todaySessions = await prisma.attendanceSession.findMany({
      where: {
        shopId,
        checkInAt: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { checkInAt: 'desc' },
      select: { staffMemberId: true, checkInAt: true, checkInPhotoPath: true, checkOutAt: true, checkOutPhotoPath: true, status: true },
    });

    const sessionMap = new Map<string, typeof todaySessions[0]>();
    for (const s of todaySessions) {
      if (!sessionMap.has(s.staffMemberId)) {
        sessionMap.set(s.staffMemberId, s);
      }
    }

    const enrichedStaff = memberships.map((m) => {
      const session = sessionMap.get(m.staffMemberId);
      const isOnFloor = session ? (session.status === 'OPEN' && !session.checkOutAt) : false;
      const isShiftCompleted = session ? (session.status === 'CLOSED' || !!session.checkOutAt) : false;

      const mWithAtt = m as typeof m & { attendanceEnabled?: boolean };
      const isAttEnabled = mWithAtt.attendanceEnabled !== false;

      return {
        ...m,
        attendanceEnabled: isAttEnabled,
        attendanceToday: session ? {
          isPresent: true,
          isOnFloor,
          isShiftCompleted,
          checkInAt: session.checkInAt,
          checkOutAt: session.checkOutAt,
          checkInPhotoPath: session.checkInPhotoPath,
          checkOutPhotoPath: session.checkOutPhotoPath,
          status: session.status,
        } : {
          isPresent: false,
          isOnFloor: false,
          isShiftCompleted: false,
          checkInAt: null,
          checkOutAt: null,
          checkInPhotoPath: null,
          checkOutPhotoPath: null,
          status: !isAttEnabled ? 'EXEMPT' : 'ABSENT',
        },
      };
    });

    // Never return sensitive fields like aadhaar/bank in list views
    res.json({ staff: enrichedStaff, total, page: parseInt(page), limit: parseInt(limit) });
  }
);

// ─── POST /api/shops/:shopId/staff ───────────────────────────────────────────
// Supervisor creates a new staff member with shop membership
staffRouter.post(
  '/shops/:shopId/staff',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    const hasAccess = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && m.capabilities.includes('staff.create')
    );
    if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Permission denied.'));

    const schema = z.object({
      fullName: z.string().min(1).max(200),
      mobile: z.string().max(20).optional(),
      address: z.string().max(500).optional(),
      positionCategoryId: z.string().min(1).optional(),
      permissionProfileId: z.string().min(1).optional(),
      workflowProfileId: z.string().min(1).optional(),
      joiningDate: z.string().optional(),
      monthlySalary: z.number().positive().optional(),
      securityDeposit: z.number().min(0).optional(),
      dutyTimingNotes: z.string().max(200).optional(),
      incentiveAmount: z.number().min(0).optional(),
      role: z.string().optional(),
      attendanceEnabled: z.boolean().optional(),
      // Account creation (optional — person can exist without login access)
      username: z.string().min(3).max(100).optional(),
      password: z.string().min(6).max(128).optional(),
    }).refine(
      (d) => !d.username || d.password,
      { message: 'Password is required when creating an account.', path: ['password'] }
    );

    const body = schema.parse(req.body);

    // Check username uniqueness
    if (body.username) {
      const existing = await prisma.account.findUnique({
        where: { username: body.username.toLowerCase() },
      });
      if (existing) {
        return next(new AppError(409, 'CONFLICT', 'Username is already taken.'));
      }
    }

    // Resolve permission profile
    let resolvedPermissionProfileId = body.permissionProfileId;
    if (!resolvedPermissionProfileId) {
      const targetRoleName = body.role || 'Staff';
      const matchedProfile = await prisma.permissionProfile.findFirst({
        where: {
          OR: [
            { id: `sys-${targetRoleName.toLowerCase().replace(/\s+/g, '-')}` },
            { name: { equals: targetRoleName, mode: 'insensitive' } },
          ],
        },
      });
      if (matchedProfile) {
        resolvedPermissionProfileId = matchedProfile.id;
      } else {
        const firstProfile = await prisma.permissionProfile.findFirst();
        if (!firstProfile) return next(new AppError(500, 'SERVER_ERROR', 'No permission profile configured.'));
        resolvedPermissionProfileId = firstProfile.id;
      }
    }

    // Resolve position category
    let resolvedPositionCategoryId = body.positionCategoryId;
    if (!resolvedPositionCategoryId && body.role) {
      const matchedPos = await prisma.positionCategory.findFirst({
        where: {
          name: { equals: body.role, mode: 'insensitive' },
          OR: [{ shopId }, { shopId: null }],
        },
      });
      if (matchedPos) {
        resolvedPositionCategoryId = matchedPos.id;
      } else {
        const newPos = await prisma.positionCategory.create({
          data: {
            name: body.role,
            shopId,
          },
        });
        resolvedPositionCategoryId = newPos.id;
      }
    }

    // Inherit the job role's work-counting rule when none is given explicitly
    let resolvedWorkflowProfileId = body.workflowProfileId ?? null;
    let resolvedRoleName = body.role ?? null;
    if (resolvedPositionCategoryId) {
      const pos = await prisma.positionCategory.findUnique({
        where: { id: resolvedPositionCategoryId },
        select: { name: true, workflowProfileId: true },
      });
      if (pos) {
        resolvedWorkflowProfileId = resolvedWorkflowProfileId ?? pos.workflowProfileId ?? null;
        resolvedRoleName = resolvedRoleName ?? pos.name;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const staffMember = await tx.staffMember.create({
        data: {
          fullName: body.fullName,
          mobile: body.mobile ?? null,
          address: body.address ?? null,
        },
      });

      let account = null;
      if (body.username && body.password) {
        const passwordHash = await hashPassword(body.password);
        account = await tx.account.create({
          data: {
            username: body.username.toLowerCase(),
            passwordHash,
            forcePasswordChange: false,
            staffMemberId: staffMember.id,
          },
        });
      }

      const isSupervisor = (body.role || '').toLowerCase().includes('supervisor') ||
        resolvedPermissionProfileId === 'sys-supervisor';
      const resolvedAttendanceEnabled = body.attendanceEnabled !== undefined
        ? body.attendanceEnabled
        : !isSupervisor;

      const membership = await tx.shopMembership.create({
        data: {
          shopId,
          staffMemberId: staffMember.id,
          // Only link account when we actually created one for this staff member.
          // Do NOT fall back to auth.accountId (the supervisor's account) — that
          // would incorrectly tie the new staff record to the supervisor's session.
          accountId: account?.id,           // undefined when no login account created — Prisma accepts string | undefined
          permissionProfileId: resolvedPermissionProfileId!,
          positionCategoryId: resolvedPositionCategoryId ?? null,
          workflowProfileId: resolvedWorkflowProfileId,
          joiningDate: body.joiningDate ? new Date(body.joiningDate) : null,
          monthlySalary: body.monthlySalary ?? null,
          securityDeposit: body.securityDeposit ?? null,
          dutyTimingNotes: body.dutyTimingNotes ?? null,
          incentiveAmount: body.incentiveAmount ?? null,
          attendanceEnabled: resolvedAttendanceEnabled,
        },
      });

      return { staffMember, account: account ? { id: account.id, username: account.username } : null, membership };
    });

    await logAudit({
      action: 'staff.created',
      entityType: 'StaffMember',
      entityId: result.staffMember.id,
      actorAccountId: auth.accountId,
      shopId,
      metadata: {
        fullName: result.staffMember.fullName,
        role: resolvedRoleName,
        username: result.account?.username ?? null,
        attendanceEnabled: result.membership.attendanceEnabled,
      },
    });

    res.status(201).json(result);
  }
);

// ─── POST /api/shops/:shopId/staff/:staffId/reset-password ───────────────────
staffRouter.post(
  '/shops/:shopId/staff/:staffId/reset-password',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, staffId } = req.params as { shopId: string; staffId: string };

    const hasAccess = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && m.capabilities.includes('staff.update')
    );
    if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Permission denied.'));

    const schema = z.object({
      password: z.string().min(6).max(128),
    });
    const { password } = schema.parse(req.body);

    const membership = await prisma.shopMembership.findFirst({
      where: { staffMemberId: staffId, shopId },
      include: { staffMember: { include: { account: true } } },
    });

    if (!membership) {
      return next(new AppError(404, 'NOT_FOUND', 'Staff member not found.'));
    }

    const passwordHash = await hashPassword(password);

    if (membership.staffMember.account) {
      await prisma.account.update({
        where: { id: membership.staffMember.account.id },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
          forcePasswordChange: false,
        },
      });
    } else {
      const generatedUsername = `${membership.staffMember.fullName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now().toString().slice(-4)}`;
      const newAccount = await prisma.account.create({
        data: {
          username: generatedUsername,
          passwordHash,
          forcePasswordChange: false,
          staffMemberId: staffId,
        },
      });
      await prisma.shopMembership.update({
        where: { id: membership.id },
        data: { accountId: newAccount.id },
      });
    }

    await logAudit({
      action: 'staff.password_reset',
      entityType: 'StaffMember',
      entityId: staffId,
      actorAccountId: auth.accountId,
      shopId,
      metadata: { fullName: membership.staffMember.fullName },
    });

    res.json({ message: 'Password updated successfully.' });
  }
);

// ─── GET /api/shops/:shopId/staff/:staffId ────────────────────────────────────
staffRouter.get(
  '/shops/:shopId/staff/:staffId',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, staffId } = req.params as { shopId: string; staffId: string };

    const hasAccess = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && m.capabilities.includes('staff.read')
    );

    // Staff can always see their own profile
    const selfMembership = await prisma.shopMembership.findFirst({
      where: { accountId: auth.accountId, shopId, staffMemberId: staffId },
    });
    const isSelf = !!selfMembership;

    if (!hasAccess && !isSelf) {
      return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));
    }

    const membership = await prisma.shopMembership.findFirst({
      where: { staffMemberId: staffId, shopId },
      include: {
        staffMember: {
          select: {
            id: true,
            fullName: true,
            mobile: true,
            address: true,
            profilePhotoPath: true,
            employmentStatus: true,
            createdAt: true,
            // Sensitive fields only for authorized roles
            ...(hasAccess ? { aadhaarEncrypted: false, bankAccountEncrypted: false } : {}),
          },
        },
        positionCategory: { select: { id: true, name: true } },
        permissionProfile: { select: { id: true, name: true } },
        workflowProfile: { select: { id: true, name: true, workflowType: true, allowedActivities: true } },
        account: { select: { id: true, username: true, status: true, lastLoginAt: true } },
      },
    });

    if (!membership) {
      return next(new AppError(404, 'NOT_FOUND', 'Staff member not found in this shop.'));
    }

    // Load custom field values
    const customValues = await prisma.customFieldValue.findMany({
      where: { staffMemberId: staffId },
      include: { customFieldDefinition: { select: { id: true, label: true, fieldType: true, key: true } } },
    });

    res.json({ ...membership, customFieldValues: customValues });
  }
);

// ─── CUSTOM FIELD VALUES (extra details per staff member) ────────────────────
async function staffNameOf(staffId: string): Promise<string | null> {
  const s = await prisma.staffMember.findUnique({ where: { id: staffId }, select: { fullName: true } });
  return s?.fullName ?? null;
}

function parseFieldScope(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { positionCategoryIds?: unknown };
    return Array.isArray(parsed.positionCategoryIds)
      ? parsed.positionCategoryIds.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

async function loadApplicableFields(shopId: string, staffId: string) {
  const membership = await prisma.shopMembership.findFirst({
    where: { staffMemberId: staffId, shopId },
    select: { positionCategoryId: true },
  });
  if (!membership) return null;
  const defs = await prisma.customFieldDefinition.findMany({
    where: { OR: [{ shopId }, { shopId: null }], isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  // Empty scope = applies to all staff; otherwise only listed job roles
  return defs.filter((d) => {
    const scope = parseFieldScope(d.visibilityScope);
    return scope.length === 0 || (!!membership.positionCategoryId && scope.includes(membership.positionCategoryId));
  });
}

// GET /api/shops/:shopId/staff/:staffId/custom-fields — fields that apply to this staff + saved values
staffRouter.get(
  '/shops/:shopId/staff/:staffId/custom-fields',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, staffId } = req.params as { shopId: string; staffId: string };
    const hasAccess = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && m.capabilities.includes('staff.read')
    );
    if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));

    const defs = await loadApplicableFields(shopId, staffId);
    if (!defs) return next(new AppError(404, 'NOT_FOUND', 'Staff member not found in this shop.'));

    const values = await prisma.customFieldValue.findMany({
      where: { staffMemberId: staffId, customFieldDefinitionId: { in: defs.map((d) => d.id) } },
    });
    const valueMap = new Map(values.map((v) => [v.customFieldDefinitionId, v]));

    res.json({
      fields: defs.map((d) => {
        const v = valueMap.get(d.id);
        let value: string | null = null;
        if (v) {
          if (d.fieldType === 'NUMBER') value = v.valueNumber != null ? v.valueNumber.toString() : null;
          else if (d.fieldType === 'DATE') value = v.valueDate ? v.valueDate.toISOString().split('T')[0] : null;
          else if (d.fieldType === 'YES_NO') value = v.valueBoolean == null ? null : v.valueBoolean ? 'YES' : 'NO';
          else if (d.fieldType === 'FILE_IMAGE') value = v.valueFilePath;
          else value = v.valueText;
        }
        return {
          id: d.id,
          key: d.key,
          label: d.label,
          helpText: d.helpText,
          fieldType: d.fieldType,
          isRequired: d.isRequired,
          dropdownOptions: d.dropdownOptions,
          value,
        };
      }),
    });
  }
);

// PUT /api/shops/:shopId/staff/:staffId/custom-fields — save extra details
staffRouter.put(
  '/shops/:shopId/staff/:staffId/custom-fields',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, staffId } = req.params as { shopId: string; staffId: string };
    const hasAccess = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && m.capabilities.includes('staff.update')
    );
    if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));

    const schema = z.object({
      values: z.array(z.object({ fieldId: z.string(), value: z.string().max(1000).nullable() })),
    });
    const { values } = schema.parse(req.body);

    const defs = await loadApplicableFields(shopId, staffId);
    if (!defs) return next(new AppError(404, 'NOT_FOUND', 'Staff member not found in this shop.'));
    const defMap = new Map(defs.map((d) => [d.id, d]));

    // Required-field check
    const incoming = new Map(values.map((v) => [v.fieldId, v.value?.trim() || null]));
    const missing = defs.filter((d) => d.isRequired && incoming.has(d.id) && !incoming.get(d.id)).map((d) => d.label);
    if (missing.length) return next(new AppError(400, 'VALIDATION_ERROR', `Please fill: ${missing.join(', ')}`));

    const ops = [];
    for (const [fieldId, raw] of incoming) {
      const def = defMap.get(fieldId);
      if (!def) continue; // field not applicable to this staff — ignore
      const data = {
        valueText: null as string | null,
        valueNumber: null as number | null,
        valueDate: null as Date | null,
        valueBoolean: null as boolean | null,
        valueFilePath: null as string | null,
      };
      if (raw !== null) {
        if (def.fieldType === 'NUMBER') {
          const n = Number(raw);
          if (Number.isNaN(n)) return next(new AppError(400, 'VALIDATION_ERROR', `"${def.label}" must be a number.`));
          data.valueNumber = n;
        } else if (def.fieldType === 'DATE') {
          const d = new Date(raw);
          if (Number.isNaN(d.getTime())) return next(new AppError(400, 'VALIDATION_ERROR', `"${def.label}" must be a valid date.`));
          data.valueDate = d;
        } else if (def.fieldType === 'YES_NO') {
          data.valueBoolean = raw === 'YES';
        } else if (def.fieldType === 'DROPDOWN') {
          if (def.dropdownOptions.length && !def.dropdownOptions.includes(raw)) {
            return next(new AppError(400, 'VALIDATION_ERROR', `"${raw}" is not an option for "${def.label}".`));
          }
          data.valueText = raw;
        } else if (def.fieldType === 'FILE_IMAGE') {
          data.valueFilePath = raw;
        } else {
          data.valueText = raw;
        }
      }
      ops.push(
        prisma.customFieldValue.upsert({
          where: { customFieldDefinitionId_staffMemberId: { customFieldDefinitionId: fieldId, staffMemberId: staffId } },
          create: { customFieldDefinitionId: fieldId, staffMemberId: staffId, ...data },
          update: data,
        })
      );
    }
    await prisma.$transaction(ops);

    await logAudit({
      action: 'staff.custom_fields_updated',
      entityType: 'StaffMember',
      entityId: staffId,
      actorAccountId: auth.accountId,
      shopId,
      metadata: { fullName: await staffNameOf(staffId), fields: Array.from(incoming.keys()).map((id) => defMap.get(id)?.key).filter(Boolean) },
    });

    res.json({ message: 'Extra details saved.' });
  }
);

// ─── PATCH /api/shops/:shopId/staff/:staffId ─────────────────────────────────
staffRouter.patch(
  '/shops/:shopId/staff/:staffId',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, staffId } = req.params as { shopId: string; staffId: string };

    const hasAccess = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && m.capabilities.includes('staff.update')
    );
    if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Permission denied.'));

    const targetMembership = await prisma.shopMembership.findFirst({
      where: { staffMemberId: staffId, shopId },
      include: { account: true, permissionProfile: true },
    });
    if (!targetMembership) {
      return next(new AppError(404, 'NOT_FOUND', 'Staff member not found in this shop.'));
    }

    if (!auth.isOwner) {
      if (targetMembership.accountId === auth.accountId) {
        return next(new AppError(403, 'FORBIDDEN', 'Supervisors cannot modify their own record. Contact the Owner.'));
      }
      if (targetMembership.permissionProfile?.isOwnerOnly) {
        return next(new AppError(403, 'FORBIDDEN', 'Supervisors cannot modify Owner records.'));
      }
    }

    const schema = z.object({
      fullName: z.string().min(1).max(200).optional(),
      mobile: z.string().max(20).nullable().optional(),
      address: z.string().max(500).nullable().optional(),
      permissionProfileId: z.string().nullable().optional(),
      positionCategoryId: z.string().nullable().optional(),
      workflowProfileId: z.string().nullable().optional(),
      joiningDate: z.string().nullable().optional(),
      monthlySalary: z.number().positive().nullable().optional(),
      securityDeposit: z.number().min(0).nullable().optional(),
      dutyTimingNotes: z.string().max(200).nullable().optional(),
      incentiveAmount: z.number().min(0).nullable().optional(),
    });

    const body = schema.parse(req.body);

    await prisma.$transaction(async (tx) => {
      if (body.fullName || body.mobile !== undefined || body.address !== undefined) {
        await tx.staffMember.update({
          where: { id: staffId },
          data: {
            ...(body.fullName ? { fullName: body.fullName } : {}),
            ...(body.mobile !== undefined ? { mobile: body.mobile } : {}),
            ...(body.address !== undefined ? { address: body.address } : {}),
          },
        });
      }

      await tx.shopMembership.updateMany({
        where: { staffMemberId: staffId, shopId },
        data: {
          ...(body.permissionProfileId !== undefined ? { permissionProfileId: body.permissionProfileId || undefined } : {}),
          ...(body.positionCategoryId !== undefined ? { positionCategoryId: body.positionCategoryId } : {}),
          ...(body.workflowProfileId !== undefined ? { workflowProfileId: body.workflowProfileId } : {}),
          ...(body.joiningDate !== undefined ? { joiningDate: body.joiningDate ? new Date(body.joiningDate) : null } : {}),
          ...(body.monthlySalary !== undefined ? { monthlySalary: body.monthlySalary } : {}),
          ...(body.securityDeposit !== undefined ? { securityDeposit: body.securityDeposit } : {}),
          ...(body.dutyTimingNotes !== undefined ? { dutyTimingNotes: body.dutyTimingNotes } : {}),
          ...(body.incentiveAmount !== undefined ? { incentiveAmount: body.incentiveAmount } : {}),
        },
      });
    });

    await logAudit({
      action: 'staff.updated',
      entityType: 'StaffMember',
      entityId: staffId,
      actorAccountId: auth.accountId,
      shopId,
      metadata: { fullName: await staffNameOf(staffId), changedFields: Object.keys(body) },
    });

    res.json({ message: 'Staff member updated successfully.' });
  }
);

// ─── PATCH /api/shops/:shopId/staff/:staffId/attendance-toggle ───────────────
// Dedicated endpoint for Owner to enable/disable attendance tracking per staff
staffRouter.patch(
  '/shops/:shopId/staff/:staffId/attendance-toggle',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, staffId } = req.params as { shopId: string; staffId: string };

    const hasAccess = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && m.capabilities.includes('staff.update')
    );
    if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Permission denied.'));

    const { attendanceEnabled } = z.object({
      attendanceEnabled: z.boolean(),
    }).parse(req.body);

    const membership = await prisma.shopMembership.findFirst({
      where: { staffMemberId: staffId, shopId },
    });
    if (!membership) return next(new AppError(404, 'NOT_FOUND', 'Staff membership not found.'));

    const updated = await prisma.shopMembership.update({
      where: { id: membership.id },
      data: { attendanceEnabled },
      select: { id: true, staffMemberId: true, attendanceEnabled: true },
    });

    await logAudit({
      action: attendanceEnabled ? 'staff.attendance_enabled' : 'staff.attendance_disabled',
      entityType: 'StaffMember',
      entityId: staffId,
      actorAccountId: auth.accountId,
      shopId,
      metadata: { fullName: await staffNameOf(staffId) },
    });

    res.json({
      success: true,
      attendanceEnabled: updated.attendanceEnabled,
      message: `Attendance tracking ${attendanceEnabled ? 'enabled' : 'disabled'} for this staff member.`,
    });
  }
);

// ─── POST /api/shops/:shopId/staff/:staffId/archive ──────────────────────────
staffRouter.post(
  '/shops/:shopId/staff/:staffId/archive',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, staffId } = req.params as { shopId: string; staffId: string };

    const hasAccess = auth.isOwner || auth.shopMemberships.some(
      (m) => m.shopId === shopId && m.capabilities.includes('staff.archive')
    );
    if (!hasAccess) return next(new AppError(403, 'FORBIDDEN', 'Permission denied.'));

    await prisma.$transaction([
      prisma.staffMember.update({
        where: { id: staffId },
        data: { employmentStatus: 'ARCHIVED' },
      }),
      prisma.shopMembership.updateMany({
        where: { staffMemberId: staffId, shopId },
        data: { isActive: false },
      }),
    ]);

    await logAudit({
      action: 'staff.archived',
      entityType: 'StaffMember',
      entityId: staffId,
      actorAccountId: auth.accountId,
      shopId,
      metadata: { fullName: await staffNameOf(staffId) },
    });

    res.json({ message: 'Staff member archived. Historical records are preserved.' });
  }
);
