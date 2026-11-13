import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../config/logger';
import { getDefaultPosSheetConfig, PosSheetConfig } from './pos-sheet.config';

export const posSheetRouter = Router();
posSheetRouter.use(authenticate as unknown as (req: Request, res: Response, next: NextFunction) => void);

function checkPosSheetAccess(
  auth: AuthenticatedRequest['auth'],
  shopId: string,
  isConfigWrite = false
): boolean {
  if (auth.isOwner) return true;
  return auth.shopMemberships.some((m: { shopId: string; capabilities: string[] }) => {
    if (m.shopId !== shopId) return false;
    if (isConfigWrite) {
      // Configuration modification: Owner, Supervisor / admin-level roles
      return (
        m.capabilities.includes('tasks.assign') ||
        m.capabilities.includes('tasks.read_team') ||
        m.capabilities.includes('staff.manage')
      );
    }
    // Read and data upload: Manager, Supervisor, Owner
    return (
      m.capabilities.includes('tasks.assign') ||
      m.capabilities.includes('tasks.read_team') ||
      m.capabilities.includes('attendance.read_team') ||
      m.capabilities.includes('staff.read')
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/shops/:shopId/pos-sheet/config — Fetch dynamic column configuration
// ─────────────────────────────────────────────────────────────────────────────
posSheetRouter.get(
  '/shops/:shopId/pos-sheet/config',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    if (!checkPosSheetAccess(auth, shopId, false)) {
      return next(new AppError(403, 'FORBIDDEN', 'Access denied to POS sheet configuration.'));
    }

    try {
      const setting = await prisma.appSetting.findUnique({
        where: {
          shopId_key: {
            shopId,
            key: 'pos_sheet_column_config',
          },
        },
      });

      const config: PosSheetConfig = setting?.value
        ? (setting.value as unknown as PosSheetConfig)
        : getDefaultPosSheetConfig();

      res.json({ config });
    } catch (err) {
      next(err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. PUT /api/shops/:shopId/pos-sheet/config — Update column configuration (Owner / Supervisor)
// ─────────────────────────────────────────────────────────────────────────────
posSheetRouter.put(
  '/shops/:shopId/pos-sheet/config',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    if (!checkPosSheetAccess(auth, shopId, true)) {
      return next(new AppError(403, 'FORBIDDEN', 'Permission denied to modify POS sheet configuration.'));
    }

    const columnSchema = z.object({
      key: z.string().min(1),
      excelHeader: z.string().min(1),
      label: z.string().min(1),
      order: z.number().int(),
      dataType: z.enum(['text', 'number', 'currency', 'date']),
      isVisibleToManager: z.boolean(),
      isVisibleToSupervisor: z.boolean(),
      isVisibleToOwner: z.boolean(),
      isRequired: z.boolean().optional(),
      isCustom: z.boolean().optional(),
    });

    const bodySchema = z.object({
      columns: z.array(columnSchema).min(1, 'At least one column is required'),
      allowManagerUpload: z.boolean().default(true),
      allowManagerDelete: z.boolean().default(false),
    });

    const body = bodySchema.parse(req.body);

    const configPayload: PosSheetConfig = {
      columns: body.columns,
      allowManagerUpload: body.allowManagerUpload,
      allowManagerDelete: body.allowManagerDelete,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.accountId,
    };

    await prisma.appSetting.upsert({
      where: {
        shopId_key: {
          shopId,
          key: 'pos_sheet_column_config',
        },
      },
      create: {
        shopId,
        key: 'pos_sheet_column_config',
        value: configPayload as any,
      },
      update: {
        value: configPayload as any,
      },
    });

    logger.info('[POS_SHEET] Updated column configuration', {
      shopId,
      columnCount: body.columns.length,
      accountId: auth.accountId,
    });

    res.json({
      config: configPayload,
      message: 'POS sheet column configuration updated successfully.',
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. POST /api/shops/:shopId/pos-sheet/upload — Upload and persist Excel daily sheet
// ─────────────────────────────────────────────────────────────────────────────
posSheetRouter.post(
  '/shops/:shopId/pos-sheet/upload',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    if (!checkPosSheetAccess(auth, shopId, false)) {
      return next(new AppError(403, 'FORBIDDEN', 'Permission denied to upload POS sheet.'));
    }

    const uploadSchema = z.object({
      sheetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'sheetDate must be YYYY-MM-DD'),
      fileName: z.string().min(1),
      fileSize: z.number().int().optional(),
      replaceExisting: z.boolean().default(false),
      entries: z.array(z.record(z.any())).min(1, 'At least 1 row is required in the sheet'),
    });

    const body = uploadSchema.parse(req.body);

    // If replaceExisting is true, delete previous batches for this date
    if (body.replaceExisting) {
      const existingBatches = await prisma.posDailySheetBatch.findMany({
        where: { shopId, sheetDate: body.sheetDate },
        select: { id: true },
      });
      if (existingBatches.length > 0) {
        await prisma.posDailySheetBatch.deleteMany({
          where: { shopId, sheetDate: body.sheetDate },
        });
      }
    }

    // Helper functions to safely parse numbers and strings
    const parseNum = (val: any): number => {
      if (val === null || val === undefined || val === '') return 0;
      if (typeof val === 'number') return isNaN(val) ? 0 : val;
      const clean = String(val).replace(/[₹,\s]/g, '').trim();
      const n = parseFloat(clean);
      return isNaN(n) ? 0 : n;
    };

    const parseStr = (val: any): string | null => {
      if (val === null || val === undefined) return null;
      const s = String(val).trim();
      return s.length > 0 ? s : null;
    };

    // 1. Create the Batch record
    const batch = await prisma.posDailySheetBatch.create({
      data: {
        shopId,
        sheetDate: body.sheetDate,
        fileName: body.fileName,
        fileSize: body.fileSize ?? null,
        rowCount: body.entries.length,
        uploadedByAccountId: auth.accountId,
        status: 'ACTIVE',
      },
    });

    // 2. Map and prepare entry records
    let totalPieces = 0;
    let totalGrossAmount = 0;
    let totalNetAmount = 0;
    let totalPaid = 0;
    let totalBalance = 0;

    const entryCreateData = body.entries.map((row) => {
      const orderNo = parseStr(row.order_no || row['Order No.'] || row['Order No'] || row.orderNo);
      const customerCode = parseStr(row.customer_code || row['Customer Code']);
      const customerName = parseStr(row.customer_name || row['Name'] || row.customerName || row.name);
      const phone = parseStr(row.phone || row['Phone'] || row.mobile);
      const pcs = parseNum(row.pieces || row['Pcs.'] || row['Pcs'] || row.pcs);
      const gross = parseNum(row.gross_amount || row['Gross Amount']);
      const net = parseNum(row.net_amount || row['Net Amount'] || row.netAmount);
      const paid = parseNum(row.paid || row['Paid'] || row.paidAmount);
      const bal = parseNum(row.balance || row['Balance']);
      const orderStatus = parseStr(row.order_status || row['Order Status'] || row.status);
      const dueDate = parseStr(row.due_date || row['Due Date']);
      const bookedBy = parseStr(row.booked_by || row['Booked By']);
      const primaryServices = parseStr(row.primary_services || row['Primary Services'] || row.services);

      totalPieces += pcs;
      totalGrossAmount += gross;
      totalNetAmount += net;
      totalPaid += paid;
      totalBalance += bal;

      return {
        batchId: batch.id,
        shopId,
        entryDate: body.sheetDate,
        orderNo,
        customerCode,
        customerName,
        phone,
        pieces: pcs,
        grossAmount: gross,
        netAmount: net,
        paid,
        balance: bal,
        orderStatus,
        dueDate,
        bookedBy,
        primaryServices,
        rowData: row,
      };
    });

    // 3. Batch insert entries in chunks of 200 for maximum PostgreSQL performance
    const chunkSize = 200;
    for (let i = 0; i < entryCreateData.length; i += chunkSize) {
      const chunk = entryCreateData.slice(i, i + chunkSize);
      await prisma.posDailySheetEntry.createMany({
        data: chunk,
      });
    }

    // 4. Update the batch with calculated summary totals
    const updatedBatch = await prisma.posDailySheetBatch.update({
      where: { id: batch.id },
      data: {
        totalPieces,
        totalGrossAmount,
        totalNetAmount,
        totalPaid,
        totalBalance,
      },
    });

    logger.info('[POS_SHEET] Imported daily sheet batch', {
      shopId,
      batchId: batch.id,
      sheetDate: body.sheetDate,
      fileName: body.fileName,
      rowCount: body.entries.length,
      totalNetAmount,
      accountId: auth.accountId,
    });

    res.status(201).json({
      batch: updatedBatch,
      rowCount: body.entries.length,
      message: `Successfully imported ${body.entries.length} orders for ${body.sheetDate}.`,
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET /api/shops/:shopId/pos-sheet — List entries and summary for a given date
// ─────────────────────────────────────────────────────────────────────────────
posSheetRouter.get(
  '/shops/:shopId/pos-sheet',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId } = req.params as { shopId: string };

    if (!checkPosSheetAccess(auth, shopId, false)) {
      return next(new AppError(403, 'FORBIDDEN', 'Access denied to POS sheet data.'));
    }

    const { date, search, batchId } = req.query as Record<string, string>;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const whereClause: any = { shopId };
    if (batchId) {
      whereClause.batchId = batchId;
    } else {
      whereClause.entryDate = targetDate;
    }

    if (search && search.trim().length > 0) {
      const q = search.trim();
      whereClause.OR = [
        { orderNo: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { orderStatus: { contains: q, mode: 'insensitive' } },
        { primaryServices: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [entries, batches, setting] = await Promise.all([
      prisma.posDailySheetEntry.findMany({
        where: whereClause,
        orderBy: [{ orderNo: 'asc' }, { createdAt: 'asc' }],
        take: 500, // Safe limit for single date
      }),
      prisma.posDailySheetBatch.findMany({
        where: { shopId, sheetDate: targetDate },
        include: {
          uploadedByAccount: {
            select: {
              id: true,
              username: true,
              staffMember: { select: { fullName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.appSetting.findUnique({
        where: {
          shopId_key: {
            shopId,
            key: 'pos_sheet_column_config',
          },
        },
      }),
    ]);

    const config: PosSheetConfig = setting?.value
      ? (setting.value as unknown as PosSheetConfig)
      : getDefaultPosSheetConfig();

    // Summary calculation
    const totalOrders = entries.length;
    const totalPieces = entries.reduce((s: number, e: { pieces: number | null }) => s + (e.pieces || 0), 0);
    const totalGrossAmount = entries.reduce((s: number, e: { grossAmount: number | null }) => s + (e.grossAmount || 0), 0);
    const totalNetAmount = entries.reduce((s: number, e: { netAmount: number | null }) => s + (e.netAmount || 0), 0);
    const totalPaid = entries.reduce((s: number, e: { paid: number | null }) => s + (e.paid || 0), 0);
    const totalBalance = entries.reduce((s: number, e: { balance: number | null }) => s + (e.balance || 0), 0);

    res.json({
      date: targetDate,
      entries,
      batches,
      config,
      summary: {
        totalOrders,
        totalPieces,
        totalGrossAmount,
        totalNetAmount,
        totalPaid,
        totalBalance,
      },
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. DELETE /api/shops/:shopId/pos-sheet/batches/:batchId — Rollback a batch
// ─────────────────────────────────────────────────────────────────────────────
posSheetRouter.delete(
  '/shops/:shopId/pos-sheet/batches/:batchId',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, batchId } = req.params as { shopId: string; batchId: string };

    if (!checkPosSheetAccess(auth, shopId, false)) {
      return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));
    }

    const batch = await prisma.posDailySheetBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch || batch.shopId !== shopId) {
      return next(new AppError(404, 'NOT_FOUND', 'Batch not found.'));
    }

    await prisma.posDailySheetBatch.delete({
      where: { id: batchId },
    });

    logger.info('[POS_SHEET] Deleted/rolled back batch', {
      shopId,
      batchId,
      fileName: batch.fileName,
      sheetDate: batch.sheetDate,
      accountId: auth.accountId,
    });

    res.json({
      success: true,
      message: `Batch "${batch.fileName}" and all its records have been deleted.`,
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. DELETE /api/shops/:shopId/pos-sheet/entries/:entryId — Delete a single entry
// ─────────────────────────────────────────────────────────────────────────────
posSheetRouter.delete(
  '/shops/:shopId/pos-sheet/entries/:entryId',
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { shopId, entryId } = req.params as { shopId: string; entryId: string };

    if (!checkPosSheetAccess(auth, shopId, false)) {
      return next(new AppError(403, 'FORBIDDEN', 'Access denied.'));
    }

    const entry = await prisma.posDailySheetEntry.findUnique({
      where: { id: entryId },
    });

    if (!entry || entry.shopId !== shopId) {
      return next(new AppError(404, 'NOT_FOUND', 'Entry not found.'));
    }

    await prisma.posDailySheetEntry.delete({
      where: { id: entryId },
    });

    res.json({
      success: true,
      message: `Entry for Order #${entry.orderNo || entryId} deleted.`,
    });
  }
);
