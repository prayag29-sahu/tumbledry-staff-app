import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';
import { dbDateForDay, dayBounds } from '../../lib/dateRange';
import { logger } from '../../config/logger';
import { WorkflowType } from '@prisma/client';

export interface CreateAssignmentInput {
  shopId: string;
  staffMemberId: string;
  createdByAccountId: string;
  assignmentDate: Date;
  workflowProfileId: string;
  serviceTypeId?: string;
  orderId?: string;
  pieceCount?: number;
  pickupCount?: number;
  customerMobile?: string;
  selectedActivities: string[]; // activity codes e.g. ["WASH","DRY"]
  notes?: string;
  idempotencyKey: string;
}

export interface TaskUnitSummary {
  total: number;
  completed: number;
  pending: number;
  percentageComplete: number | null;
  totalUnits?: number;
  completedUnits?: number;
  pendingUnits?: number;
  percentage?: number | null;
  breakdown?: {
    wash: number;
    dry: number;
    iron: number;
    fold: number;
    pack: number;
    delivery: number;
    pickup: number;
  };
  dailyProgress?: Array<{
    date: string;
    total: number;
    completed: number;
  }>;
}

/**
 * Creates a task assignment and all corresponding task units atomically.
 *
 * Counting rules (server-authoritative):
 * - PIECE_ACTIVITY (Washerman/Ironman): one unit per piece × selected activity
 *   5 pieces + [WASH, DRY] = 10 units
 *   5 pieces + [IRON, FOLD, PACK] = 15 units
 * - PER_ORDER (Delivery): one unit per order, irrespective of piece count
 * - COUNT_BASED (Pickup): N independently completable units from pickupCount
 */
export async function createAssignment(input: CreateAssignmentInput) {
  // Validate idempotency — if the same key exists, return existing assignment
  const existing = await prisma.taskAssignment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { taskUnits: true },
  });
  if (existing) {
    logger.info('[TASK] Idempotent request — returning existing assignment', {
      assignmentId: existing.id,
    });
    return existing;
  }

  // Load workflow profile to validate allowed activities
  let workflowProfile = await prisma.workflowProfile.findUnique({
    where: { id: input.workflowProfileId },
  });

  if (!workflowProfile && input.workflowProfileId === 'wfp-directive') {
    workflowProfile = await prisma.workflowProfile.upsert({
      where: { id: 'wfp-directive' },
      update: {},
      create: {
        id: 'wfp-directive',
        name: 'Operational Directives',
        description: 'Text-based instructions and tasks for managers and operational staff.',
        workflowType: WorkflowType.COUNT_BASED,
        allowedActivities: [],
        requiresOrderId: false,
        requiresPieceCount: false,
        requiresServiceType: false,
        isActive: true,
      },
    });
  }

  if (!workflowProfile || !workflowProfile.isActive) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Workflow profile not found or inactive.');
  }

  // Validate selected activities are allowed by the workflow profile
  const invalidActivities = input.selectedActivities.filter(
    (a) => !workflowProfile.allowedActivities.includes(a)
  );
  if (invalidActivities.length > 0) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      `Activities not allowed for this workflow: ${invalidActivities.join(', ')}`
    );
  }

  // Validate required fields per workflow type
  if (workflowProfile.workflowType === WorkflowType.PIECE_ACTIVITY) {
    if (!input.pieceCount || input.pieceCount < 1) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Piece count is required and must be a positive integer.');
    }
    if (!input.orderId) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Order ID is required.');
    }
    if (input.selectedActivities.length === 0) {
      throw new AppError(422, 'VALIDATION_ERROR', 'At least one activity must be selected.');
    }
  }

  if (workflowProfile.workflowType === WorkflowType.PER_ORDER) {
    if (!input.orderId) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Order ID is required for delivery assignments.');
    }
    if (!input.pieceCount || input.pieceCount < 1) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Piece count is required.');
    }
  }

  if (workflowProfile.workflowType === WorkflowType.COUNT_BASED) {
    if (!input.pickupCount || input.pickupCount < 1) {
      input.pickupCount = 1;
    }
  }

  // Load activity type IDs for PIECE_ACTIVITY
  let activityTypeMap: Map<string, string> = new Map(); // code → id
  if (workflowProfile.workflowType === WorkflowType.PIECE_ACTIVITY && input.selectedActivities.length > 0) {
    const activityTypes = await prisma.activityType.findMany({
      where: { code: { in: input.selectedActivities }, isActive: true },
      select: { id: true, code: true },
    });
    activityTypeMap = new Map(activityTypes.map((a) => [a.code, a.id]));

    // Ensure all requested activities exist
    const missingActivities = input.selectedActivities.filter((a) => !activityTypeMap.has(a));
    if (missingActivities.length > 0) {
      throw new AppError(
        422,
        'VALIDATION_ERROR',
        `Activity codes not found: ${missingActivities.join(', ')}`
      );
    }
  }

  // Generate task units within a transaction
  const result = await prisma.$transaction(async (tx) => {
    const assignment = await tx.taskAssignment.create({
      data: {
        shopId: input.shopId,
        staffMemberId: input.staffMemberId,
        createdByAccountId: input.createdByAccountId,
        assignmentDate: input.assignmentDate,
        workflowProfileId: input.workflowProfileId,
        serviceTypeId: input.serviceTypeId ?? null,
        orderId: input.orderId ?? null,
        pieceCount: input.pieceCount ?? null,
        pickupCount: input.pickupCount ?? null,
        customerMobile: input.customerMobile ?? null,
        selectedActivities: input.selectedActivities,
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey,
        configVersion: workflowProfile.updatedAt.toISOString(),
      },
    });

    const units: Array<{
      shopId: string;
      staffMemberId: string;
      taskAssignmentId: string;
      unitType: 'PIECE_ACTIVITY' | 'PER_ORDER' | 'COUNT_BASED';
      pieceNumber?: number;
      activityTypeId?: string;
      activityCode?: string;
      sequenceNumber?: number;
      orderRef?: string;
    }> = [];

    switch (workflowProfile.workflowType) {
      case WorkflowType.PIECE_ACTIVITY: {
        // One unit per piece × per selected activity
        for (let piece = 1; piece <= (input.pieceCount ?? 0); piece++) {
          for (const actCode of input.selectedActivities) {
            units.push({
              shopId: input.shopId,
              staffMemberId: input.staffMemberId,
              taskAssignmentId: assignment.id,
              unitType: 'PIECE_ACTIVITY',
              pieceNumber: piece,
              activityTypeId: activityTypeMap.get(actCode),
              activityCode: actCode,
            });
          }
        }
        break;
      }
      case WorkflowType.PER_ORDER: {
        // One unit per delivery order
        units.push({
          shopId: input.shopId,
          staffMemberId: input.staffMemberId,
          taskAssignmentId: assignment.id,
          unitType: 'PER_ORDER',
          orderRef: input.orderId ?? undefined,
        });
        break;
      }
      case WorkflowType.COUNT_BASED: {
        // N independently completable pickup units
        for (let i = 1; i <= (input.pickupCount ?? 0); i++) {
          units.push({
            shopId: input.shopId,
            staffMemberId: input.staffMemberId,
            taskAssignmentId: assignment.id,
            unitType: 'COUNT_BASED',
            sequenceNumber: i,
          });
        }
        break;
      }
    }

    if (units.length === 0) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Assignment would generate zero task units.');
    }

    await tx.taskUnit.createMany({ data: units });

    logger.info('[TASK] Assignment created', {
      assignmentId: assignment.id,
      shopId: input.shopId,
      staffMemberId: input.staffMemberId,
      workflowType: workflowProfile.workflowType,
      unitsGenerated: units.length,
    });

    return tx.taskAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
      include: { taskUnits: true },
    });
  });

  return result;
}

/**
 * Completes a single task unit.
 * Validates that the unit belongs to the requesting staff member and shop.
 */
export async function completeTaskUnit(
  taskUnitId: string,
  staffMemberId: string,
  shopId: string,
  completedByAccountId: string,
  isPrivileged: boolean = false
): Promise<void> {
  const unit = await prisma.taskUnit.findUnique({
    where: { id: taskUnitId },
    select: {
      id: true,
      shopId: true,
      staffMemberId: true,
      status: true,
      taskAssignment: { select: { status: true, assignmentDate: true } },
    },
  });

  if (!unit) throw new AppError(404, 'NOT_FOUND', 'Task unit not found.');
  if (unit.shopId !== shopId) throw new AppError(403, 'FORBIDDEN', 'Access denied.');
  if (unit.staffMemberId !== staffMemberId && !isPrivileged) throw new AppError(403, 'FORBIDDEN', 'This task is not assigned to you.');
  if (unit.taskAssignment.status !== 'ACTIVE') throw new AppError(409, 'CONFLICT', 'Assignment is no longer active.');

  // Validate task can only be completed on its assigned date (today)
  const today = dayBounds();
  const assignBounds = dayBounds(unit.taskAssignment.assignmentDate.toISOString().slice(0, 10));
  if (assignBounds.dateKey !== today.dateKey) {
    throw new AppError(400, 'TASK_DATE_MISMATCH', 'Tasks can only be marked as completed on their assigned date (today). Past or future tasks cannot be completed.');
  }

  // Validate that staff attendance check-in has been marked for today
  const attendanceToday = await prisma.attendanceSession.findFirst({
    where: {
      shopId: unit.shopId,
      staffMemberId: unit.staffMemberId,
      checkInAt: { gte: today.startOfDay, lte: today.endOfDay },
    },
    select: { id: true, checkInAt: true },
  });

  if (!attendanceToday || !attendanceToday.checkInAt) {
    throw new AppError(403, 'ATTENDANCE_REQUIRED', 'Attendance check-in is required before tasks can be marked complete.');
  }

  if (unit.status === 'COMPLETED') return; // idempotent
  if (unit.status === 'CANCELLED') throw new AppError(409, 'CONFLICT', 'Task unit has been cancelled.');

  await prisma.taskUnit.update({
    where: { id: taskUnitId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedByAccountId,
    },
  });
}

/**
 * Toggles a task unit between COMPLETED and PENDING.
 */
export async function toggleTaskUnit(
  taskUnitId: string,
  staffMemberId: string,
  shopId: string,
  completedByAccountId: string,
  isPrivileged: boolean = false
) {
  const unit = await prisma.taskUnit.findUnique({
    where: { id: taskUnitId },
    select: {
      id: true,
      shopId: true,
      staffMemberId: true,
      status: true,
      taskAssignment: { select: { status: true, assignmentDate: true } },
    },
  });

  if (!unit) throw new AppError(404, 'NOT_FOUND', 'Task unit not found.');
  if (unit.shopId !== shopId) throw new AppError(403, 'FORBIDDEN', 'Access denied.');
  if (unit.staffMemberId !== staffMemberId && !isPrivileged) throw new AppError(403, 'FORBIDDEN', 'This task is not assigned to you.');
  if (unit.taskAssignment.status !== 'ACTIVE') throw new AppError(409, 'CONFLICT', 'Assignment is no longer active.');

  const nextStatus = unit.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';

  if (nextStatus === 'COMPLETED') {
    const today = dayBounds();
    const assignBounds = dayBounds(unit.taskAssignment.assignmentDate.toISOString().slice(0, 10));
    if (assignBounds.dateKey !== today.dateKey) {
      throw new AppError(400, 'TASK_DATE_MISMATCH', 'Tasks can only be marked as completed on their assigned date (today). Past or future tasks cannot be completed.');
    }

    const attendanceToday = await prisma.attendanceSession.findFirst({
      where: {
        shopId: unit.shopId,
        staffMemberId: unit.staffMemberId,
        checkInAt: { gte: today.startOfDay, lte: today.endOfDay },
      },
      select: { id: true, checkInAt: true },
    });

    if (!attendanceToday || !attendanceToday.checkInAt) {
      throw new AppError(403, 'ATTENDANCE_REQUIRED', 'Attendance check-in is required before tasks can be marked complete.');
    }
  }

  return prisma.taskUnit.update({
    where: { id: taskUnitId },
    data: {
      status: nextStatus,
      completedAt: nextStatus === 'COMPLETED' ? new Date() : null,
      completedByAccountId: nextStatus === 'COMPLETED' ? completedByAccountId : null,
    },
  });
}

/**
 * Calculates task unit summary for a staff member on a given date.
 * Server-authoritative: all calculations from database rows.
 */
export async function getTaskSummary(
  staffMemberId: string,
  shopId: string,
  dateInput: Date | string = new Date()
): Promise<TaskUnitSummary> {
  const dateStr = typeof dateInput === 'string' ? dateInput : dateInput.toISOString().split('T')[0];
  const { dbDate } = dbDateForDay(dateStr);

  const assignments = await prisma.taskAssignment.findMany({
    where: {
      staffMemberId,
      shopId,
      assignmentDate: dbDate,
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  if (assignments.length === 0) {
    return {
      total: 0,
      completed: 0,
      pending: 0,
      percentageComplete: null,
      breakdown: { wash: 0, dry: 0, iron: 0, fold: 0, pack: 0, delivery: 0, pickup: 0 },
    };
  }

  const assignmentIds = assignments.map((a) => a.id);

  const units = await prisma.taskUnit.findMany({
    where: { taskAssignmentId: { in: assignmentIds }, status: { not: 'CANCELLED' } },
    select: { status: true, activityCode: true, unitType: true },
  });

  let completedCount = 0;
  const breakdown = { wash: 0, dry: 0, iron: 0, fold: 0, pack: 0, delivery: 0, pickup: 0 };

  for (const u of units) {
    if (u.status === 'COMPLETED') {
      completedCount++;
    }
    const code = (u.activityCode || '').toUpperCase();
    if (code.includes('WASH')) breakdown.wash++;
    else if (code.includes('DRY')) breakdown.dry++;
    else if (code.includes('IRON')) breakdown.iron++;
    else if (code.includes('FOLD')) breakdown.fold++;
    else if (code.includes('PACK')) breakdown.pack++;
    else if (u.unitType === 'PER_ORDER') breakdown.delivery++;
    else if (u.unitType === 'COUNT_BASED') breakdown.pickup++;
  }

  const totalCount = units.length;
  const percentageComplete = totalCount > 0
    ? Math.round((completedCount / totalCount) * 100)
    : null;

  return {
    total: totalCount,
    completed: completedCount,
    pending: totalCount - completedCount,
    percentageComplete,
    totalUnits: totalCount,
    completedUnits: completedCount,
    pendingUnits: totalCount - completedCount,
    percentage: percentageComplete,
    breakdown,
  };
}

/**
 * Monthly task summary for a staff member.
 */
export async function getMonthlyTaskSummary(
  staffMemberId: string,
  shopId: string,
  year: number,
  month: number // 1-indexed
): Promise<TaskUnitSummary> {
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const endOfMonth = new Date(Date.UTC(year, month, 0));

  const assignments = await prisma.taskAssignment.findMany({
    where: {
      staffMemberId,
      shopId,
      assignmentDate: { gte: startOfMonth, lte: endOfMonth },
      status: 'ACTIVE',
    },
    select: {
      id: true,
      assignmentDate: true,
      taskUnits: {
        where: { status: { not: 'CANCELLED' } },
        select: { status: true, activityCode: true, unitType: true },
      },
    },
    orderBy: { assignmentDate: 'asc' },
  });

  if (assignments.length === 0) {
    return {
      total: 0,
      completed: 0,
      pending: 0,
      percentageComplete: null,
      breakdown: { wash: 0, dry: 0, iron: 0, fold: 0, pack: 0, delivery: 0, pickup: 0 },
      dailyProgress: [],
    };
  }

  let totalCount = 0;
  let completedCount = 0;
  const breakdown = { wash: 0, dry: 0, iron: 0, fold: 0, pack: 0, delivery: 0, pickup: 0 };
  const dailyMap: Record<string, { total: number; completed: number }> = {};

  for (const a of assignments) {
    const dateKey = a.assignmentDate.toISOString().split('T')[0];
    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = { total: 0, completed: 0 };
    }

    for (const u of a.taskUnits) {
      totalCount++;
      dailyMap[dateKey].total++;
      if (u.status === 'COMPLETED') {
        completedCount++;
        dailyMap[dateKey].completed++;
      }

      const code = (u.activityCode || '').toUpperCase();
      if (code.includes('WASH')) breakdown.wash++;
      else if (code.includes('DRY')) breakdown.dry++;
      else if (code.includes('IRON')) breakdown.iron++;
      else if (code.includes('FOLD')) breakdown.fold++;
      else if (code.includes('PACK')) breakdown.pack++;
      else if (u.unitType === 'PER_ORDER') breakdown.delivery++;
      else if (u.unitType === 'COUNT_BASED') breakdown.pickup++;
    }
  }

  const dailyProgress = Object.entries(dailyMap).map(([date, counts]) => ({
    date,
    total: counts.total,
    completed: counts.completed,
  }));

  const percentageComplete = totalCount > 0
    ? Math.round((completedCount / totalCount) * 100)
    : null;

  return {
    total: totalCount,
    completed: completedCount,
    pending: totalCount - completedCount,
    percentageComplete,
    totalUnits: totalCount,
    completedUnits: completedCount,
    pendingUnits: totalCount - completedCount,
    percentage: percentageComplete,
    breakdown,
    dailyProgress,
  };
}
