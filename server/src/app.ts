import 'express-async-errors';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { allowedOrigins, env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFound } from './middleware/errorHandler';

// Route modules
import { authRouter } from './modules/auth/auth.router';
import { shopsRouter } from './modules/shops/shops.router';
import { staffRouter } from './modules/staff/staff.router';
import { taskRouter } from './modules/tasks/task.router';
import { attendanceRouter } from './modules/attendance/attendance.router';
import { damageRouter } from './modules/damage/damage.router';
import { configRouter } from './modules/config/config.router';

const app = express();

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ─── CORS (exact allowlist only) ──────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('[CORS] Rejected origin', { origin });
      callback(new Error('CORS: origin not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Idempotency-Key'],
}));

// ─── Request ID injection ─────────────────────────────────────────────────────
app.use((req, _res, next) => {
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = uuidv4();
  }
  next();
});

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Login: strict
const loginLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_LOGIN_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many attempts. Please try again later.', requestId: '' } },
});

// General API: lenient
const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Health endpoint (no auth) ────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
    version: process.env['npm_package_version'] ?? 'unknown',
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', loginLimiter);
app.use('/api/auth', authRouter);
app.use(generalLimiter);

app.use('/api/shops', shopsRouter);        // /api/shops & /api/shops/:shopId
app.use('/api', staffRouter);        // /api/shops/:shopId/staff
app.use('/api', taskRouter);         // /api/shops/:shopId/staff/:staffId/tasks
app.use('/api', attendanceRouter);   // /api/shops/:shopId/attendance
app.use('/api', damageRouter);       // /api/shops/:shopId/damage
app.use('/api/config', configRouter);

// ─── 404 and error handling ───────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export { app };
