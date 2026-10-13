import winston from 'winston';
import { env } from '../config/env';

const redactedFields = [
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'refreshToken',
  'accessToken',
  'authorization',
  'cookie',
  'aadhaar',
  'bankAccount',
  'bank_account',
  'serviceRoleKey',
];

function redactSensitive(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || typeof obj !== 'object') return obj;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (redactedFields.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      result[key] = redactSensitive(value, depth + 1);
    } else {
      result[key] = value;
    }
  }
  return result;
};

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format((info) => {
      if (info.meta) {
        info.meta = redactSensitive(info.meta);
      }
      return info;
    })()
  ),
  transports: [
    new winston.transports.Console({
      format:
        env.NODE_ENV === 'development'
          ? winston.format.combine(winston.format.colorize(), winston.format.simple())
          : winston.format.json(),
    }),
  ],
});
