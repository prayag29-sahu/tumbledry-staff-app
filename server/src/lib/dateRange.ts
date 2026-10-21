/**
 * Shared calendar-day boundary helper.
 *
 * `new Date('YYYY-MM-DD')` parses as UTC midnight, which shifts the day for
 * shops in non-UTC timezones (e.g. IST +05:30) and makes date-filtered
 * queries return the wrong day's rows. This helper always builds the
 * boundaries from the explicit year / month / day components in server-local
 * time, so every date-filtered endpoint uses identical day windows.
 */
export interface DayBounds {
  startOfDay: Date;
  endOfDay: Date;
  /** Normalised YYYY-MM-DD string for the resolved day. */
  dateKey: string;
  /** True when the resolved day is the current server-local day. */
  isToday: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function dayBounds(dateStr?: string | null): DayBounds {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  let d = now.getDate();

  if (dateStr && DATE_RE.test(dateStr)) {
    const [py, pm, pd] = dateStr.split('-').map(Number);
    y = py;
    m = pm - 1;
    d = pd;
  }

  const startOfDay = new Date(y, m, d, 0, 0, 0, 0);
  const endOfDay = new Date(y, m, d, 23, 59, 59, 999);
  const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const isToday = y === now.getFullYear() && m === now.getMonth() && d === now.getDate();

  return { startOfDay, endOfDay, dateKey, isToday };
}

/**
 * Timestamp to use when a supervisor/manager records attendance for a day.
 * For today we use the real current time; for a past/future day we anchor
 * the record inside that day (10:00 local) so it is stored on the correct date.
 */
export function anchorTimeForDay(bounds: DayBounds): Date {
  if (bounds.isToday) return new Date();
  const anchor = new Date(bounds.startOfDay);
  anchor.setHours(10, 0, 0, 0);
  return anchor;
}

/**
 * Anchor date for PostgreSQL `@db.Date` fields (such as `task_assignments.assignment_date`).
 * Because Prisma serializes Date to `@db.Date` by extracting the UTC calendar date (YYYY-MM-DD),
 * passing a UTC midnight Date (`YYYY-MM-DDT00:00:00.000Z`) guarantees that the exact `dateKey`
 * is matched without timezone shifts.
 */
export function dbDateForDay(dateStr?: string | null): { dbDate: Date; dateKey: string; isToday: boolean } {
  const { dateKey, isToday } = dayBounds(dateStr);
  const dbDate = new Date(`${dateKey}T00:00:00.000Z`);
  return { dbDate, dateKey, isToday };
}

