/**
 * Attendance & Shift Timing Evaluator (IST Centric)
 * Strictly evaluates attendance based on database-stored staff shift configurations.
 * No hardcoded defaults: direct owner/supervisor configuration.
 */

export interface ShiftTimingConfig {
  shiftStartTime?: string | null;     // e.g. "09:30" (IST HH:mm)
  shiftEndTime?: string | null;       // e.g. "19:30" (IST HH:mm)
  lateThreshold?: string | null;      // e.g. "09:45" (IST check-in after this is LATE)
  halfDayThreshold?: string | null;   // e.g. "12:00" (IST check-in after this is HALF DAY)
  halfDayMinHours?: number | string | { toString(): string } | null; // e.g. 4.0 hours (worked duration < this = HALF DAY)
  fullDayMinHours?: number | string | { toString(): string } | null; // e.g. 8.0 hours
}

export interface SessionData {
  checkInAt?: Date | string | null;
  checkOutAt?: Date | string | null;
  durationMinutes?: number | null;
  status?: string | null; // OPEN, CLOSED, NEEDS_REVIEW
}

export interface EvaluatedAttendance {
  attendanceType: 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT';
  isOnFloor: boolean;
  isShiftCompleted: boolean;
  checkInTimeIST: string | null;
  checkOutTimeIST: string | null;
  isLate: boolean;
  isHalfDay: boolean;
  delayMinutes: number;
  statusReason: string | null;
}

/**
 * Converts a UTC Date to Indian Standard Time (IST, UTC+5:30) formatted as "HH:mm".
 */
export function toISTTimeString(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Converts a UTC Date to Indian Standard Time (IST) 12-hour formatted time, e.g. "09:45 AM".
 */
export function toISTTime12h(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/**
 * Parses "HH:mm" time string into minutes since midnight.
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

/**
 * Pure, deterministic evaluation of attendance status based on staff's DB shift timings.
 */
export function evaluateAttendance(
  session: SessionData | null | undefined,
  config?: ShiftTimingConfig | null
): EvaluatedAttendance {
  // If no session exists for the date => ABSENT
  if (!session || !session.checkInAt) {
    return {
      attendanceType: 'ABSENT',
      isOnFloor: false,
      isShiftCompleted: false,
      checkInTimeIST: null,
      checkOutTimeIST: null,
      isLate: false,
      isHalfDay: false,
      delayMinutes: 0,
      statusReason: 'No check-in recorded for this day',
    };
  }

  const checkInIST = toISTTimeString(session.checkInAt);
  const checkOutIST = session.checkOutAt ? toISTTimeString(session.checkOutAt) : null;
  const checkInMin = timeStringToMinutes(checkInIST);

  const isOnFloor = session.status === 'OPEN' && !session.checkOutAt;
  const isShiftCompleted = session.status === 'CLOSED' || !!session.checkOutAt;

  // Calculate duration in minutes if checkout occurred or current time if open
  let durationMinutes = session.durationMinutes ?? null;
  if (durationMinutes == null && session.checkInAt && session.checkOutAt) {
    const startMs = new Date(session.checkInAt).getTime();
    const endMs = new Date(session.checkOutAt).getTime();
    if (endMs > startMs) {
      durationMinutes = Math.floor((endMs - startMs) / 60000);
    }
  }

  // If no DB shift configs are set by Owner or Supervisor:
  if (
    !config ||
    (!config.shiftStartTime &&
      !config.lateThreshold &&
      !config.halfDayThreshold &&
      !config.halfDayMinHours &&
      !config.fullDayMinHours)
  ) {
    return {
      attendanceType: 'PRESENT',
      isOnFloor,
      isShiftCompleted,
      checkInTimeIST: checkInIST,
      checkOutTimeIST: checkOutIST,
      isLate: false,
      isHalfDay: false,
      delayMinutes: 0,
      statusReason: null,
    };
  }

  let isHalfDay = false;
  let isLate = false;
  let delayMinutes = 0;
  let statusReason: string | null = null;

  // 1. Check-in after Half-Day threshold (e.g. after 12:00 IST)
  if (config.halfDayThreshold) {
    const halfDayMin = timeStringToMinutes(config.halfDayThreshold);
    if (checkInMin >= halfDayMin) {
      isHalfDay = true;
      statusReason = `Checked in after Half-Day cutoff (${config.halfDayThreshold} IST)`;
    }
  }

  // 2. Worked duration less than minimum required half-day hours (e.g. worked < 4 hours)
  if (!isHalfDay && isShiftCompleted && config.halfDayMinHours != null && durationMinutes != null) {
    const minMins = Number(config.halfDayMinHours) * 60;
    if (durationMinutes < minMins) {
      isHalfDay = true;
      statusReason = `Worked ${Math.round(durationMinutes / 60 * 10) / 10}h (less than min ${config.halfDayMinHours}h requirement)`;
    }
  }

  // 3. Late Check-in threshold check (e.g. check-in after 09:45 IST)
  if (!isHalfDay) {
    const compareThreshold = config.lateThreshold || config.shiftStartTime;
    if (compareThreshold) {
      const lateCutoffMin = timeStringToMinutes(compareThreshold);
      if (checkInMin > lateCutoffMin) {
        isLate = true;
        delayMinutes = checkInMin - lateCutoffMin;
        statusReason = `Checked in ${delayMinutes}m after ${compareThreshold} IST`;
      }
    }
  }

  // 4. Check if duration is below Full-Day requirement but above Half-Day requirement
  if (!isHalfDay && isShiftCompleted && config.fullDayMinHours != null && durationMinutes != null) {
    const fullDayMins = Number(config.fullDayMinHours) * 60;
    if (durationMinutes < fullDayMins) {
      isHalfDay = true;
      statusReason = `Worked ${Math.round(durationMinutes / 60 * 10) / 10}h (less than full day ${config.fullDayMinHours}h requirement)`;
    }
  }

  const attendanceType: 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' = isHalfDay
    ? 'HALF_DAY'
    : isLate
    ? 'LATE'
    : 'PRESENT';

  return {
    attendanceType,
    isOnFloor,
    isShiftCompleted,
    checkInTimeIST: checkInIST,
    checkOutTimeIST: checkOutIST,
    isLate,
    isHalfDay,
    delayMinutes,
    statusReason,
  };
}
