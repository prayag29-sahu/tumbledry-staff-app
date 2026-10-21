import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../../db/prisma';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../config/logger';

// ─────────────────────────────────────────────
// Password hashing (Argon2id)
// ─────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,   // 64 MiB
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// ─────────────────────────────────────────────
// JWT access tokens (short-lived, in memory on client)
// ─────────────────────────────────────────────
export function signAccessToken(accountId: string, isOwner: boolean, tokenVersion: number): string {
  return jwt.sign(
    { sub: accountId, isOwner, tokenVersion },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'] }
  );
}

// ─────────────────────────────────────────────
// Refresh tokens (stored as hash in DB, sent as HttpOnly cookie)
// ─────────────────────────────────────────────
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(64).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

export async function createRefreshSession(
  accountId: string,
  deviceInfo?: string,
  ipAddress?: string
): Promise<string> {
  const { token, hash } = generateRefreshToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.JWT_REFRESH_EXPIRY_DAYS);

  await prisma.refreshSession.create({
    data: {
      accountId,
      tokenHash: hash,
      deviceInfo,
      ipAddress,
      expiresAt,
    },
  });

  return token;
}

// ─────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────
export interface AuthAccountResponse {
  id: string;
  username: string;
  isOwner: boolean;
  forcePasswordChange: boolean;
  staffMember?: {
    id: string;
    fullName: string;
    mobile?: string | null;
    address?: string | null;
    profilePhotoPath?: string | null;
    employmentStatus?: string | null;
  } | null;
  shopMemberships: Array<{
    shopId: string;
    shopName: string;
    shopCode: string;
    roleName: string;
    capabilities: string[];
    positionCategory?: string | null;
    joiningDate?: string | null;
    dutyTimingNotes?: string | null;
    monthlySalary?: number | null;
    shiftStartTime?: string | null;
    shiftEndTime?: string | null;
    lateThreshold?: string | null;
    halfDayThreshold?: string | null;
    absentThreshold?: string | null;
    incentiveAmount?: number | null;
    attendanceEnabled?: boolean;
  }>;
}

export async function getAccountProfile(accountId: string): Promise<AuthAccountResponse | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      username: true,
      isOwner: true,
      status: true,
      forcePasswordChange: true,
      staffMember: {
        select: {
          id: true,
          fullName: true,
          mobile: true,
          address: true,
          profilePhotoPath: true,
          employmentStatus: true,
        },
      },
      shopMemberships: {
        where: { isActive: true },
        select: {
          shopId: true,
          shop: { select: { name: true, code: true } },
          permissionProfile: {
            select: {
              name: true,
              capabilities: { select: { capability: true } },
            },
          },
          positionCategory: { select: { name: true } },
          joiningDate: true,
          dutyTimingNotes: true,
          monthlySalary: true,
          shiftStartTime: true,
          shiftEndTime: true,
          lateThreshold: true,
          halfDayThreshold: true,
          absentThreshold: true,
          incentiveAmount: true,
          attendanceEnabled: true,
        },
      },
    },
  });

  if (!account || account.status !== 'ACTIVE') return null;

  let shopMemberships: Array<{
    shopId: string;
    shopName: string;
    shopCode: string;
    roleName: string;
    capabilities: string[];
    positionCategory?: string | null;
    joiningDate?: string | null;
    dutyTimingNotes?: string | null;
    monthlySalary?: number | null;
    shiftStartTime?: string | null;
    shiftEndTime?: string | null;
    lateThreshold?: string | null;
    halfDayThreshold?: string | null;
    absentThreshold?: string | null;
    incentiveAmount?: number | null;
    attendanceEnabled?: boolean;
  }> = [];

  if (account.isOwner) {
    const allShops = await prisma.shop.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
    shopMemberships = allShops.map((s) => ({
      shopId: s.id,
      shopName: s.name,
      shopCode: s.code,
      roleName: 'Owner',
      capabilities: ['*'],
      positionCategory: 'Owner',
      joiningDate: null,
      dutyTimingNotes: null,
      monthlySalary: null,
      shiftStartTime: null,
      shiftEndTime: null,
      lateThreshold: null,
      halfDayThreshold: null,
      absentThreshold: null,
      incentiveAmount: null,
      attendanceEnabled: false,
    }));
  } else {
    shopMemberships = account.shopMemberships.map((m) => ({
      shopId: m.shopId,
      shopName: m.shop.name,
      shopCode: m.shop.code,
      roleName: m.permissionProfile.name,
      capabilities: m.permissionProfile.capabilities.map((c) => c.capability),
      positionCategory: m.positionCategory?.name ?? null,
      joiningDate: m.joiningDate ? m.joiningDate.toISOString() : null,
      dutyTimingNotes: m.dutyTimingNotes ?? null,
      monthlySalary: m.monthlySalary ? Number(m.monthlySalary) : null,
      shiftStartTime: m.shiftStartTime ?? null,
      shiftEndTime: m.shiftEndTime ?? null,
      lateThreshold: m.lateThreshold ?? null,
      halfDayThreshold: m.halfDayThreshold ?? null,
      absentThreshold: m.absentThreshold ?? null,
      incentiveAmount: m.incentiveAmount ? Number(m.incentiveAmount) : null,
      attendanceEnabled: m.attendanceEnabled !== false,
    }));
  }

  return {
    id: account.id,
    username: account.username,
    isOwner: account.isOwner,
    forcePasswordChange: account.forcePasswordChange,
    staffMember: account.staffMember,
    shopMemberships,
  };
}

export async function loginWithPassword(
  username: string,
  password: string,
  deviceInfo?: string,
  ipAddress?: string
): Promise<{ accessToken: string; refreshToken: string; account: AuthAccountResponse }> {
  const normalizedUsername = username.toLowerCase().trim();

  const account = await prisma.account.findUnique({
    where: { username: normalizedUsername },
    select: {
      id: true,
      passwordHash: true,
      status: true,
      isOwner: true,
      tokenVersion: true,
    },
  });

  // Use constant-time comparison to prevent user enumeration timing attacks
  const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$dummyhash';
  const hashToVerify = account?.passwordHash ?? DUMMY_HASH;
  const passwordValid = await verifyPassword(hashToVerify, password).catch(() => false);

  if (!account || !passwordValid || account.status !== 'ACTIVE') {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
  }

  // Update last login
  await prisma.account.update({
    where: { id: account.id },
    data: { lastLoginAt: new Date() },
  });

  const accessToken = signAccessToken(account.id, account.isOwner, account.tokenVersion);
  const refreshToken = await createRefreshSession(account.id, deviceInfo, ipAddress);

  const profile = await getAccountProfile(account.id);
  if (!profile) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Account is no longer active.');
  }

  logger.info('[AUTH] Login successful', { accountId: account.id });

  return {
    accessToken,
    refreshToken,
    account: profile,
  };
}

// ─────────────────────────────────────────────
// Refresh tokens
// ─────────────────────────────────────────────
export async function refreshTokens(
  rawToken: string,
  deviceInfo?: string,
  ipAddress?: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const now = new Date();

  const session = await prisma.refreshSession.findFirst({
    where: {
      tokenHash: hash,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    include: {
      account: {
        select: { id: true, status: true, isOwner: true, tokenVersion: true },
      },
    },
  });

  if (!session) {
    // Check if this token was just rotated in the last 60 seconds (concurrency grace period)
    const graceThreshold = new Date(now.getTime() - 60 * 1000);
    const recentRevoked = await prisma.refreshSession.findFirst({
      where: {
        tokenHash: hash,
        revokedAt: { gte: graceThreshold },
        expiresAt: { gt: now },
      },
      include: {
        account: {
          select: { id: true, status: true, isOwner: true, tokenVersion: true },
        },
      },
    });

    if (recentRevoked && recentRevoked.account.status === 'ACTIVE') {
      const newAccessToken = signAccessToken(
        recentRevoked.account.id,
        recentRevoked.account.isOwner,
        recentRevoked.account.tokenVersion
      );
      const newRefreshToken = await createRefreshSession(recentRevoked.accountId, deviceInfo, ipAddress);
      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    }

    throw new AppError(401, 'UNAUTHORIZED', 'Session expired or revoked. Please log in again.');
  }

  if (session.account.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Account is no longer active.');
  }

  // Rotate: revoke old session, create new one
  await prisma.refreshSession.update({
    where: { id: session.id },
    data: { revokedAt: now },
  });

  const newAccessToken = signAccessToken(
    session.account.id,
    session.account.isOwner,
    session.account.tokenVersion
  );
  const newRefreshToken = await createRefreshSession(session.accountId, deviceInfo, ipAddress);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

// ─────────────────────────────────────────────
// Logout (revoke current refresh session)
// ─────────────────────────────────────────────
export async function logout(rawToken: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await prisma.refreshSession.updateMany({
    where: { tokenHash: hash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ─────────────────────────────────────────────
// Logout all (revoke all sessions and increment tokenVersion)
// ─────────────────────────────────────────────
export async function logoutAll(accountId: string): Promise<void> {
  await prisma.$transaction([
    prisma.refreshSession.updateMany({
      where: { accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.account.update({
      where: { id: accountId },
      data: { tokenVersion: { increment: 1 } },
    }),
  ]);
  logger.info('[AUTH] All sessions revoked', { accountId });
}

// ─────────────────────────────────────────────
// Change password
// ─────────────────────────────────────────────
export async function changePassword(
  accountId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { passwordHash: true, status: true },
  });
  if (!account || account.status !== 'ACTIVE') {
    throw new AppError(404, 'NOT_FOUND', 'Account not found.');
  }

  const valid = await verifyPassword(account.passwordHash, currentPassword);
  if (!valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  }

  const newHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.account.update({
      where: { id: accountId },
      data: {
        passwordHash: newHash,
        forcePasswordChange: false,
        tokenVersion: { increment: 1 },
      },
    }),
    prisma.refreshSession.updateMany({
      where: { accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  logger.info('[AUTH] Password changed', { accountId });
}
