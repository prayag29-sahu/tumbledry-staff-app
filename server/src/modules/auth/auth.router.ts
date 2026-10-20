import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';
import {
  loginWithPassword,
  refreshTokens,
  logout,
  logoutAll,
  changePassword,
  getAccountProfile,
} from './auth.service';

export const authRouter = Router();

const REFRESH_COOKIE = 'td_refresh';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: env.JWT_REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

// POST /api/auth/login
authRouter.post('/login', async (req: Request, res: Response) => {
  const schema = z.object({
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(128),
  });

  const body = schema.parse(req.body);
  const result = await loginWithPassword(
    body.username,
    body.password,
    req.headers['user-agent'],
    req.ip
  );

  setRefreshCookie(res, result.refreshToken);

  res.json({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    account: result.account,
  });
});

// POST /api/auth/refresh
authRouter.post('/refresh', async (req: Request, res: Response) => {
  const rawToken = (req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken || req.headers['x-refresh-token']) as string | undefined;
  if (!rawToken) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No refresh session.', requestId: '' } });
    return;
  }

  const result = await refreshTokens(rawToken, req.headers['user-agent'], req.ip);
  setRefreshCookie(res, result.refreshToken);
  res.json({ accessToken: result.accessToken, refreshToken: result.refreshToken });
});

// GET /api/auth/me — fetch current account profile & memberships
authRouter.get(
  '/me',
  authenticate as unknown as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;
    const profile = await getAccountProfile(auth.accountId);
    if (!profile) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Account not found.', requestId: '' } });
      return;
    }
    res.json({ account: profile });
  }
);

// POST /api/auth/logout
authRouter.post('/logout', async (req: Request, res: Response) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (rawToken) {
    await logout(rawToken).catch(() => undefined);
  }
  clearRefreshCookie(res);
  res.json({ message: 'Logged out successfully.' });
});

// POST /api/auth/logout-all — revoke all sessions for the authenticated account
authRouter.post(
  '/logout-all',
  authenticate as unknown as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;
    await logoutAll(auth.accountId);
    clearRefreshCookie(res);
    res.json({ message: 'All sessions revoked.' });
  }
);

// POST /api/auth/change-password
authRouter.post(
  '/change-password',
  authenticate as unknown as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
    });
    const body = schema.parse(req.body);
    const auth = (req as AuthenticatedRequest).auth;
    await changePassword(auth.accountId, body.currentPassword, body.newPassword);
    clearRefreshCookie(res);
    res.json({ message: 'Password changed. Please log in again.' });
  }
);

// PATCH /api/auth/profile — update logged-in user's own contact & personal details
authRouter.patch(
  '/profile',
  authenticate as unknown as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      const schema = z.object({
        fullName: z.string().min(1).max(200).optional(),
        mobile: z.string().max(20).nullable().optional(),
        address: z.string().max(500).nullable().optional(),
        dutyTimingNotes: z.string().max(200).nullable().optional(),
        shopId: z.string().optional(),
      });
      const body = schema.parse(req.body);

      const account = await prisma.account.findUnique({
        where: { id: auth.accountId },
        include: { staffMember: true },
      });

      if (!account) {
        return next(new AppError(404, 'NOT_FOUND', 'Account not found.'));
      }

      if (account.staffMember) {
        await prisma.staffMember.update({
          where: { id: account.staffMember.id },
          data: {
            ...(body.fullName ? { fullName: body.fullName } : {}),
            ...(body.mobile !== undefined ? { mobile: body.mobile } : {}),
            ...(body.address !== undefined ? { address: body.address } : {}),
          },
        });
      }

      if (body.dutyTimingNotes !== undefined && body.shopId) {
        await prisma.shopMembership.updateMany({
          where: {
            accountId: auth.accountId,
            shopId: body.shopId,
          },
          data: {
            dutyTimingNotes: body.dutyTimingNotes,
          },
        });
      }

      const updated = await getAccountProfile(auth.accountId);
      res.json({ account: updated, message: 'Profile details updated successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

