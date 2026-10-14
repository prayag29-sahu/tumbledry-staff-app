import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';
import { hashPassword } from '../auth/auth.service';

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

    // Fetch today's attendance sessions to attach presence status
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySessions = await prisma.attendanceSession.findMany({
      where: {
        shopId,
        checkInAt: { gte: today },
      },
      select: { staffMemberId: true, checkInAt: true, checkOutAt: true, status: true },
    });
    const sessionMap = new Map(todaySessions.map((s) => [s.staffMemberId, s]));

    const enrichedStaff = memberships.map((m) => {
      const session = sessionMap.get(m.staffMemberId);
      return {
        ...m,
        attendanceToday: session ? {
          isPresent: true,
          checkInAt: session.checkInAt,
          checkOutAt: session.checkOutAt,
          status: session.status,
        } : {
          isPresent: false,
          checkInAt: null,
          checkOutAt: null,
          status: 'ABSENT',
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
          workflowProfileId: body.workflowProfileId ?? null,
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

    res.json({ message: 'Staff member archived. Historical records are preserved.' });
  }
);
