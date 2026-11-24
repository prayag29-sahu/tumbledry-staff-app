import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { prisma } from '../../db/prisma';
import {
  canUserAccessSalary,
  getShopSalarySummary,
  getStaffPayslipData,
  calculateStaffMonthSalary,
  recordAdvanceDeduction,
  listAdvanceDeductions,
  deleteAdvanceDeduction,
  processSalaryPayment,
  updateStaffSalaryTerms,
  getSalarySettings,
  updateSalarySettings,
  getShopMonthHolidays,
  updateShopMonthHolidays,
  createTemporaryStaff,
} from './salary.service';

export const salaryRouter = Router();

salaryRouter.use(authenticate as unknown as (req: Request, res: Response, next: NextFunction) => void);

/**
 * GET /api/shops/:shopId/salary/summary
 * Query params: ?month=YYYY-MM&search=...
 */
salaryRouter.get(
  '/shops/:shopId/salary/summary',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      const { shopId } = req.params as { shopId: string };
      const { month, search } = req.query as { month?: string; search?: string };

      const canAccess = await canUserAccessSalary(auth, shopId, 'view');
      if (!canAccess) {
        return next(new AppError(403, 'FORBIDDEN', 'You do not have access to salary records.'));
      }

      // Default to current month "YYYY-MM"
      const now = new Date();
      const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const summary = await getShopSalarySummary(shopId, targetMonth, search);
      res.json({ data: summary });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/shops/:shopId/salary/my-salary
 * Direct endpoint for logged in staff member to view their own salary
 */
salaryRouter.get(
  '/shops/:shopId/salary/my-salary',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      const { shopId } = req.params as { shopId: string };
      const { month } = req.query as { month?: string };

      const account = await prisma.account.findUnique({
        where: { id: auth.accountId },
        select: { staffMemberId: true },
      });

      if (!account?.staffMemberId) {
        return next(new AppError(404, 'NOT_FOUND', 'No staff member profile linked to this account.'));
      }

      const now = new Date();
      const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const calculation = await calculateStaffMonthSalary(shopId, account.staffMemberId, targetMonth);
      res.json({ data: calculation });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/shops/:shopId/salary/staff/:staffMemberId/slip
 * Query params: ?month=YYYY-MM
 */
salaryRouter.get(
  '/shops/:shopId/salary/staff/:staffMemberId/slip',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      const { shopId, staffMemberId } = req.params as { shopId: string; staffMemberId: string };
      const { month } = req.query as { month?: string };

      const canAccess = await canUserAccessSalary(auth, shopId, 'view', staffMemberId);
      if (!canAccess) {
        return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));
      }

      const now = new Date();
      const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const payslip = await getStaffPayslipData(shopId, staffMemberId, targetMonth);
      res.json({ data: payslip });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/shops/:shopId/salary/staff/:staffMemberId/calculate
 * Query params: ?month=YYYY-MM
 */
salaryRouter.get(
  '/shops/:shopId/salary/staff/:staffMemberId/calculate',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      const { shopId, staffMemberId } = req.params as { shopId: string; staffMemberId: string };
      const { month } = req.query as { month?: string };

      const canAccess = await canUserAccessSalary(auth, shopId, 'view', staffMemberId);
      if (!canAccess) {
        return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));
      }

      const now = new Date();
      const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const calculation = await calculateStaffMonthSalary(shopId, staffMemberId, targetMonth);
      res.json({ data: calculation });
    } catch (err) {
      next(err);
    }
  }
);

const RecordAdvanceSchema = z.object({
  staffMemberId: z.string().uuid(),
  type: z.enum(['ADVANCE', 'DEDUCTION', 'BONUS', 'PENALTY', 'LOAN']),
  amount: z.number().positive(),
  date: z.string().min(1),
  targetMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  reason: z.string().min(1).max(300),
  paymentMode: z.string().optional(),
});

/**
 * POST /api/shops/:shopId/salary/advances
 * Record an advance or deduction
 */
salaryRouter.post(
  '/shops/:shopId/salary/advances',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      const { shopId } = req.params as { shopId: string };

      const canManage = await canUserAccessSalary(auth, shopId, 'manage');
      if (!canManage) {
        return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to record salary advances or deductions.'));
      }

      const parsed = RecordAdvanceSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input.'));
      }

      const record = await recordAdvanceDeduction(shopId, parsed.data, auth.accountId);
      res.status(201).json({ data: record, message: 'Recorded successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/shops/:shopId/salary/advances
 * List advances and deductions with optional filters
 */
salaryRouter.get(
  '/shops/:shopId/salary/advances',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      const { shopId } = req.params as { shopId: string };
      const { staffMemberId, targetMonth, type, startDate, endDate } = req.query as Record<string, string>;

      const canAccess = await canUserAccessSalary(auth, shopId, 'view');
      if (!canAccess) {
        return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));
      }

      const list = await listAdvanceDeductions(shopId, {
        staffMemberId,
        targetMonth,
        type,
        startDate,
        endDate,
      });

      res.json({ data: list });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/shops/:shopId/salary/advances/:advanceId
 */
salaryRouter.delete(
  '/shops/:shopId/salary/advances/:advanceId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      const { shopId, advanceId } = req.params as { shopId: string; advanceId: string };

      const canManage = await canUserAccessSalary(auth, shopId, 'manage');
      if (!canManage) {
        return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to delete entries.'));
      }

      const result = await deleteAdvanceDeduction(shopId, advanceId, auth.accountId);
      res.json({ data: result, message: 'Entry removed successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

const ProcessSalarySchema = z.object({
  status: z.enum(['PAID', 'PROCESSED', 'ON_HOLD', 'DRAFT']),
  paymentMode: z.string().optional(),
  paidDate: z.string().optional(),
  transactionRef: z.string().max(100).optional(),
  remarks: z.string().max(300).optional(),
});

/**
 * POST /api/shops/:shopId/salary/staff/:staffMemberId/process
 * Settle or Mark a staff monthly salary as Paid
 */
salaryRouter.post(
  '/shops/:shopId/salary/staff/:staffMemberId/process',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      const { shopId, staffMemberId } = req.params as { shopId: string; staffMemberId: string };
      const { month } = req.query as { month?: string };

      const canManage = await canUserAccessSalary(auth, shopId, 'manage');
      if (!canManage) {
        return next(new AppError(403, 'FORBIDDEN', 'Permission denied.'));
      }

      const parsed = ProcessSalarySchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input.'));
      }

      const now = new Date();
      const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const payment = await processSalaryPayment(
        shopId,
        staffMemberId,
        targetMonth,
        parsed.data,
        auth.accountId
      );

      res.json({ data: payment, message: `Salary marked as ${parsed.data.status}.` });
    } catch (err) {
      next(err);
    }
  }
);

const UpdateSalaryTermsSchema = z.object({
  monthlySalary: z.number().min(0).optional(),
  incentiveAmount: z.number().min(0).optional(),
  joiningDate: z.string().nullable().optional(),
  salaryCycleDay: z.number().min(1).max(28).optional(),
  salaryPaymentDate: z.number().min(1).max(28).optional(),
  salaryNotes: z.string().max(300).optional(),
  wageType: z.enum(['MONTHLY', 'DAILY']).optional(),
  dailyWageRate: z.number().min(0).nullable().optional(),
});

/**
 * PATCH /api/shops/:shopId/staff/:staffMemberId/salary-terms
 * Configure staff joining date, salary, cycle day, and payment date
 */
salaryRouter.patch(
  '/shops/:shopId/staff/:staffMemberId/salary-terms',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      const { shopId, staffMemberId } = req.params as { shopId: string; staffMemberId: string };

      const canManage = await canUserAccessSalary(auth, shopId, 'manage');
      if (!canManage) {
        return next(new AppError(403, 'FORBIDDEN', 'Permission denied.'));
      }

      const parsed = UpdateSalaryTermsSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input.'));
      }

      const updated = await updateStaffSalaryTerms(
        shopId,
        staffMemberId,
        parsed.data,
        auth.accountId
      );

      res.json({ data: updated, message: 'Salary terms updated successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/shops/:shopId/salary/settings
 */
salaryRouter.get(
  '/shops/:shopId/salary/settings',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      const { shopId } = req.params as { shopId: string };

      const canAccess = await canUserAccessSalary(auth, shopId, 'view');
      if (!canAccess) {
        return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));
      }

      const settings = await getSalarySettings(shopId);
      res.json({ data: settings });
    } catch (err) {
      next(err);
    }
  }
);

const UpdateSalarySettingsSchema = z.object({
  supervisorCanManageSalary: z.boolean().optional(),
  supervisorCanViewSalary: z.boolean().optional(),
  defaultSalaryCycleDay: z.number().min(1).max(28).optional(),
  defaultPaymentDate: z.number().min(1).max(28).optional(),
  companyName: z.string().min(1).max(100).optional(),
});

/**
 * PUT /api/shops/:shopId/salary/settings
 * Owner only control for salary permissions & global shop rules
 */
salaryRouter.put(
  '/shops/:shopId/salary/settings',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      const { shopId } = req.params as { shopId: string };

      if (!auth.isOwner) {
        return next(new AppError(403, 'FORBIDDEN', 'Only the Owner can configure salary permissions.'));
      }

      const parsed = UpdateSalarySettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input.'));
      }

      const updated = await updateSalarySettings(shopId, parsed.data, auth.accountId);
      res.json({ data: updated, message: 'Salary settings updated successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/shops/:shopId/salary/holidays
 * Query params: ?month=YYYY-MM
 */
salaryRouter.get(
  '/shops/:shopId/salary/holidays',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      const { shopId } = req.params as { shopId: string };
      const { month } = req.query as { month?: string };

      const canAccess = await canUserAccessSalary(auth, shopId, 'view');
      if (!canAccess) {
        return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));
      }

      const now = new Date();
      const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const holidays = await getShopMonthHolidays(shopId, targetMonth);
      res.json({ data: holidays });
    } catch (err) {
      next(err);
    }
  }
);

const UpdateHolidaysSchema = z.object({
  weeklyOffDay: z.number().min(0).max(6).optional(),
  holidays: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      name: z.string().min(1).max(100),
      type: z.enum(['WEEKLY_OFF', 'STORE_HOLIDAY', 'PAID_LEAVE']),
    })
  ),
});

/**
 * PUT /api/shops/:shopId/salary/holidays
 * Query params: ?month=YYYY-MM
 * Configure weekly offs and holidays for a month (Supervisor or Owner)
 */
salaryRouter.put(
  '/shops/:shopId/salary/holidays',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      const { shopId } = req.params as { shopId: string };
      const { month } = req.query as { month?: string };

      const canManage = await canUserAccessSalary(auth, shopId, 'manage');
      if (!canManage) {
        return next(new AppError(403, 'FORBIDDEN', 'Permission denied to configure store holidays.'));
      }

      const parsed = UpdateHolidaysSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input.'));
      }

      const now = new Date();
      const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const updated = await updateShopMonthHolidays(shopId, targetMonth, parsed.data, auth.accountId);
      res.json({ data: updated, message: 'Store holidays & weekly offs updated successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

const CreateTemporaryStaffSchema = z.object({
  fullName: z.string().min(1).max(100),
  mobile: z.string().max(20).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  roleDescription: z.string().max(100).optional().nullable(),
  wageType: z.enum(['MONTHLY', 'DAILY']),
  amount: z.number().positive(),
  joiningDate: z.string().optional().nullable(),
  notes: z.string().max(300).optional().nullable(),
});

/**
 * POST /api/shops/:shopId/salary/temporary-staff
 * Add a temporary staff member (for wages, expense & salary tracking without app login)
 */
salaryRouter.post(
  '/shops/:shopId/salary/temporary-staff',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      const { shopId } = req.params as { shopId: string };

      const canManage = await canUserAccessSalary(auth, shopId, 'manage');
      if (!canManage) {
        return next(new AppError(403, 'FORBIDDEN', 'Permission denied to add temporary staff.'));
      }

      const parsed = CreateTemporaryStaffSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input.'));
      }

      const result = await createTemporaryStaff(
        shopId,
        {
          fullName: parsed.data.fullName,
          mobile: parsed.data.mobile || undefined,
          address: parsed.data.address || undefined,
          roleDescription: parsed.data.roleDescription || undefined,
          wageType: parsed.data.wageType,
          amount: parsed.data.amount,
          joiningDate: parsed.data.joiningDate || undefined,
          notes: parsed.data.notes || undefined,
        },
        auth.accountId
      );

      res.status(201).json({ data: result, message: 'Temporary staff added successfully.' });
    } catch (err) {
      next(err);
    }
  }
);
