/**
 * Attendance & Shift Timing Evaluator (IST Centric)
 * Strictly evaluates attendance based on database-stored staff shift configurations.
 * No hardcoded defaults: direct owner/supervisor configuration.
 */

export interface ShiftTimingConfig {
  shiftStartTime?: string | null;     // e.g. "09:00" Check-in / Shift Start (IST HH:mm)
  shiftEndTime?: string | null;       // e.g. "19:30" Shift End / Check-out (IST HH:mm)
  lateThreshold?: string | null;      // e.g. "09:35" (Check-in <= this = PRESENT; > this = LATE)
  halfDayThreshold?: string | null;   // e.g. "10:00" (Check-in <= this = LATE; > this = HALF_DAY)
  absentThreshold?: string | null;    // e.g. "12:00" (Check-in > this = ABSENT)
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
 * Converts a UTC Date to Indian Standard Time (IST) 12-hour formatted time with AM/PM, e.g. "09:45 AM".
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
 * Converts a "HH:mm" 24h string (e.g. "19:30" or "09:00") or 12h string (e.g. "07:30 PM")
 * into a formatted 12-hour IST string, e.g. "07:30 PM", "09:00 AM".
 */
export function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const trimmed = timeStr.trim();
  if (trimmed.toUpperCase().includes('AM') || trimmed.toUpperCase().includes('PM')) {
    return trimmed;
  }
  const parts = trimmed.split(':');
  if (parts.length < 2) return trimmed;
  let h = parseInt(parts[0], 10);
  const m = parts[1].slice(0, 2).padStart(2, '0');
  if (isNaN(h)) return trimmed;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const hStr = String(h).padStart(2, '0');
  return `${hStr}:${m} ${ampm}`;
}

/**
 * Parses time string into minutes since midnight.
 * Supports both 24-hour ("19:30", "09:35") and 12-hour ("07:30 PM", "09:35 AM") clock strings.
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const trimmed = timeStr.trim().toUpperCase();
  const isPM = trimmed.includes('PM');
  const isAM = trimmed.includes('AM');
  const clean = trimmed.replace(/[AP]M/g, '').trim();
  const parts = clean.split(':');
  let h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;

  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;

  return h * 60 + m;
}

/**
 * Deterministic evaluation of attendance status based on DB-configured time cutoffs (IST, 12-hour clock).
 * 
 * Rules configured by Owner / Supervisor:
 * 1. checkIn <= lateThreshold                     -> PRESENT (On-time check-in window)
 * 2. lateThreshold < checkIn <= halfDayThreshold  -> LATE (Late window)
 * 3. halfDayThreshold < checkIn <= absentThreshold -> HALF_DAY (Half-day window)
 * 4. checkIn > absentThreshold                    -> ABSENT (Checked in after absent cutoff)
 * 5. No check-in recorded                         -> ABSENT
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

  const checkInIST12 = toISTTime12h(session.checkInAt);
  const checkOutIST12 = session.checkOutAt ? toISTTime12h(session.checkOutAt) : null;
  const checkInIST24 = toISTTimeString(session.checkInAt);
  const checkInMin = timeStringToMinutes(checkInIST24);

  const isOnFloor = session.status === 'OPEN' && !session.checkOutAt;
  const isShiftCompleted = session.status === 'CLOSED' || !!session.checkOutAt;

  // If no timing configs are set by Owner or Supervisor in DB, default to PRESENT
  if (
    !config ||
    (!config.shiftStartTime &&
      !config.lateThreshold &&
      !config.halfDayThreshold &&
      !config.absentThreshold)
  ) {
    return {
      attendanceType: 'PRESENT',
      isOnFloor,
      isShiftCompleted,
      checkInTimeIST: checkInIST12,
      checkOutTimeIST: checkOutIST12,
      isLate: false,
      isHalfDay: false,
      delayMinutes: 0,
      statusReason: 'On-time check-in (no custom timings configured)',
    };
  }

  // 1. Check if check-in is after Absent Cutoff (e.g. after 12:00 PM IST -> ABSENT)
  if (config.absentThreshold) {
    const absentMin = timeStringToMinutes(config.absentThreshold);
    if (checkInMin > absentMin) {
      return {
        attendanceType: 'ABSENT',
        isOnFloor,
        isShiftCompleted,
        checkInTimeIST: checkInIST12,
        checkOutTimeIST: checkOutIST12,
        isLate: false,
        isHalfDay: false,
        delayMinutes: 0,
        statusReason: `Checked in after Absent Cutoff (${formatTime12h(config.absentThreshold)} IST)`,
      };
    }
  }

  // 2. Check if check-in is after Half-Day threshold (e.g. after 10:00 AM IST up to 12:00 PM IST -> HALF_DAY)
  if (config.halfDayThreshold) {
    const halfDayMin = timeStringToMinutes(config.halfDayThreshold);
    if (checkInMin > halfDayMin) {
      return {
        attendanceType: 'HALF_DAY',
        isOnFloor,
        isShiftCompleted,
        checkInTimeIST: checkInIST12,
        checkOutTimeIST: checkOutIST12,
        isLate: false,
        isHalfDay: true,
        delayMinutes: 0,
        statusReason: `Checked in after Half-Day Cutoff (${formatTime12h(config.halfDayThreshold)} IST)`,
      };
    }
  }

  // 3. Check if check-in is after On-time cutoff (e.g. after 09:35 AM IST up to 10:00 AM IST -> LATE)
  const onTimeCutoff = config.lateThreshold || config.shiftStartTime;
  if (onTimeCutoff) {
    const onTimeMin = timeStringToMinutes(onTimeCutoff);
    if (checkInMin > onTimeMin) {
      const delayMinutes = checkInMin - onTimeMin;
      return {
        attendanceType: 'LATE',
        isOnFloor,
        isShiftCompleted,
        checkInTimeIST: checkInIST12,
        checkOutTimeIST: checkOutIST12,
        isLate: true,
        isHalfDay: false,
        delayMinutes,
        statusReason: `Checked in ${delayMinutes}m after ${formatTime12h(onTimeCutoff)} IST`,
      };
    }
  }

  // 4. On-time check-in within window (e.g. 09:00 AM - 09:35 AM IST -> PRESENT)
  return {
    attendanceType: 'PRESENT',
    isOnFloor,
    isShiftCompleted,
    checkInTimeIST: checkInIST12,
    checkOutTimeIST: checkOutIST12,
    isLate: false,
    isHalfDay: false,
    delayMinutes: 0,
    statusReason: 'On-time check-in',
  };
}
