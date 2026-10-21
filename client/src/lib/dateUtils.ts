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

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
