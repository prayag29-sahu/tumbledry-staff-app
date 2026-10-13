import { prisma } from '../db/prisma';
import { logger } from '../config/logger';

export interface AuditLogInput {
  action: string;
  entityType: string;
  entityId: string;
  actorAccountId: string;
  shopId?: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

export async function logAudit(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        actorAccountId: input.actorAccountId,
        shopId: input.shopId ?? null,
        metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
        requestId: input.requestId,
      },
    });
  } catch (err) {
    logger.warn('Failed to record audit log:', err);
  }
}
