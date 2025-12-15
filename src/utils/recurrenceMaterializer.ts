import { differenceInCalendarDays, differenceInCalendarMonths, startOfWeek } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import type { RecurringPattern } from '@/services/firestore';

const TIMEZONE = 'Asia/Jerusalem';

function toIsraelMidnight(dateStr: string): Date {
  // dateStr is YYYY-MM-DD
  return toZonedTime(new Date(`${dateStr}T00:00:00`), TIMEZONE);
}

function formatIsraelDate(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, 'yyyy-MM-dd');
}

function isOccurrenceOnDate(dateStr: string, seriesStartDateStr: string, pattern: RecurringPattern): boolean {
  const seriesStart = toIsraelMidnight(seriesStartDateStr);
  const date = toIsraelMidnight(dateStr);

  if (date < seriesStart) return false;

  if (pattern.endDate) {
    const seriesEnd = toIsraelMidnight(pattern.endDate);
    if (date > seriesEnd) return false;
  }

  const interval = Math.max(1, pattern.interval || 1);

  switch (pattern.frequency) {
    case 'daily': {
      const diffDays = differenceInCalendarDays(date, seriesStart);
      return diffDays % interval === 0;
    }
    case 'weekly': {
      const allowedDays =
        pattern.daysOfWeek && pattern.daysOfWeek.length > 0
          ? pattern.daysOfWeek
          : [seriesStart.getDay()];

      if (!allowedDays.includes(date.getDay())) return false;

      const seriesWeekStart = startOfWeek(seriesStart, { weekStartsOn: 0 });
      const dateWeekStart = startOfWeek(date, { weekStartsOn: 0 });
      const diffWeeks = Math.floor(differenceInCalendarDays(dateWeekStart, seriesWeekStart) / 7);
      return diffWeeks % interval === 0;
    }
    case 'monthly': {
      if (date.getDate() !== seriesStart.getDate()) return false;
      const diffMonths = differenceInCalendarMonths(date, seriesStart);
      return diffMonths % interval === 0;
    }
    default:
      return false;
  }
}

/**
 * Compute instance dates (YYYY-MM-DD) for a recurring series in a given range (inclusive).
 * Note: materialization should typically clamp `rangeStart` to today to avoid backfilling history.
 */
export function getRecurringDateStringsInRange(args: {
  seriesStartDate: string; // YYYY-MM-DD
  pattern: RecurringPattern;
  rangeStart: Date;
  rangeEnd: Date;
}): string[] {
  const { seriesStartDate, pattern, rangeStart, rangeEnd } = args;

  const startStr = formatIsraelDate(rangeStart);
  const endStr = formatIsraelDate(rangeEnd);

  // Clamp the iteration start to the series start date.
  const iterStart = startStr < seriesStartDate ? seriesStartDate : startStr;

  const dates: string[] = [];
  let cursor = toIsraelMidnight(iterStart);
  const end = toIsraelMidnight(endStr);

  while (cursor <= end) {
    const cursorStr = formatIsraelDate(cursor);
    if (isOccurrenceOnDate(cursorStr, seriesStartDate, pattern)) {
      dates.push(cursorStr);
    }
    // Move by one day in local Date space; we always normalize via formatIsraelDate/toIsraelMidnight.
    cursor.setDate(cursor.getDate() + 1);
    cursor = toIsraelMidnight(formatIsraelDate(cursor));
  }

  return dates;
}


