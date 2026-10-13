import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './errorHandler';
import { prisma } from '../db/prisma';

export interface AuthenticatedRequest extends Request {
  auth: {
    accountId: string;
    isOwner: boolean;
    tokenVersion: number;
    shopMemberships: Array<{
      shopId: string;
      permissionProfileId: string;
      capabilities: string[];
    }>;
  };
}

interface AccessTokenPayload {
  sub: string; // accountId
  isOwner: boolean;
  tokenVersion: number;
  iat: number;
  exp: number;
}

/**
 * Validates the JWT access token from the Authorization Bearer header.
 * Loads the full permission context into req.auth.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
  }

  const token = authHeader.slice(7);
  let payload: AccessTokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
  } catch {
    return next(new AppError(401, 'UNAUTHORIZED', 'Session expired or invalid. Please log in again.'));
  }

  // Validate token version to allow server-side invalidation (logout all sessions)
  const account = await prisma.account.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      status: true,
      isOwner: true,
      tokenVersion: true,
      shopMemberships: {
        where: { isActive: true },
        select: {
          shopId: true,
          permissionProfileId: true,
          permissionProfile: {
            select: {
              capabilities: { select: { capability: true } },
            },
          },
        },
      },
    },
  });

  if (!account || account.status !== 'ACTIVE') {
    return next(new AppError(401, 'UNAUTHORIZED', 'Account not found or disabled.'));
  }

  if (account.tokenVersion !== payload.tokenVersion) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Session has been revoked. Please log in again.'));
  }

  (req as AuthenticatedRequest).auth = {
    accountId: account.id,
    isOwner: account.isOwner,
    tokenVersion: account.tokenVersion,
    shopMemberships: account.shopMemberships.map((m) => ({
      shopId: m.shopId,
      permissionProfileId: m.permissionProfileId,
      capabilities: m.permissionProfile.capabilities.map((c) => c.capability),
    })),
  };

  next();
}

/**
 * Returns the shop memberships the authenticated user has access to.
 * Validates that the requested shopId is in the user's memberships.
 */
export function getShopAccess(req: AuthenticatedRequest, shopId: string) {
  const auth = req.auth;
  if (auth.isOwner) return null; // Owner can access all shops
  const membership = auth.shopMemberships.find((m) => m.shopId === shopId);
  if (!membership) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this shop.');
  }
  return membership;
}

/**
 * Middleware factory: requires the user to have ALL of the specified capabilities
 * for the shop derived from the request.
 */
export function requireCapability(...required: string[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
    }

    // Owner always has all capabilities
    if (auth.isOwner) return next();

    const shopId = req.params['shopId'] || (req.body as Record<string, unknown>)?.shopId;
    const membership = auth.shopMemberships.find((m) => m.shopId === shopId);
    if (!membership) {
      return next(new AppError(403, 'FORBIDDEN', 'Access denied for this shop.'));
    }

    const missing = required.filter((cap) => !membership.capabilities.includes(cap));
    if (missing.length > 0) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    }
    next();
  };
}

/**
 * Middleware: requires the user to be the platform Owner.
 */
export function requireOwner(req: Request, _res: Response, next: NextFunction): void {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth?.isOwner) {
    return next(new AppError(403, 'FORBIDDEN', 'Owner access required.'));
  }
  next();
}
