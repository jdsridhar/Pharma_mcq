import type { BillingIntervalT } from '@pharmacy/contracts';

/** Pure period-end calculation for a billing interval. LIFETIME has no end (null). */
export function computePeriodEnd(start: Date, interval: BillingIntervalT): Date | null {
  const end = new Date(start);
  switch (interval) {
    case 'MONTHLY':
      end.setMonth(end.getMonth() + 1);
      return end;
    case 'QUARTERLY':
      end.setMonth(end.getMonth() + 3);
      return end;
    case 'YEARLY':
      end.setFullYear(end.getFullYear() + 1);
      return end;
    case 'LIFETIME':
      return null;
    default:
      return end;
  }
}
