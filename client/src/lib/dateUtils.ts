/**
 * Client Date Utilities
 * 
 * Safely handles local calendar dates (YYYY-MM-DD) without UTC timezone shifting.
 * Using toISOString().split('T')[0] shifts back by 1 day in IST (UTC+05:30)
 * before 05:30 AM or when converting local midnight dates.
 */

export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysToDateKey(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return localDateKey(date);
}

export function formatDisplayDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  const dObj = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (!isNaN(dObj.getTime())) {
    return dObj.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  if (typeof dateStr === 'string') {
    const clean = dateStr.split('T')[0];
    const parts = clean.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      const fallbackDate = new Date(parts[0], parts[1] - 1, parts[2]);
      return fallbackDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  }
  return String(dateStr);
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
 * Resolves the effective duty timing string.
 * If manual dutyTimingNotes is set, returns that.
 * Otherwise, if shiftStartTime and shiftEndTime are set, computes:
 * "09:30 AM – 08:30 PM" automatically.
 */
export function resolveDutyTiming(
  notes?: string | null,
  startTime?: string | null,
  endTime?: string | null
): string {
  if (notes && notes.trim() && notes.trim() !== 'Not specified') {
    return notes.trim();
  }
  if (startTime && endTime) {
    return `${formatTime12h(startTime)} – ${formatTime12h(endTime)}`;
  }
  if (startTime) {
    return `From ${formatTime12h(startTime)}`;
  }
  return 'Not specified';
}
