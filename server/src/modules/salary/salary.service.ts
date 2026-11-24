import { prisma } from '../../db/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../lib/audit';

export interface SalarySettings {
  supervisorCanManageSalary: boolean;
  supervisorCanViewSalary: boolean;
  defaultSalaryCycleDay: number; // 1-28 (1 = 1st to end-of-month)
  defaultPaymentDate: number; // 1-28 (e.g. 7th of every month)
  companyName: string;
}

const DEFAULT_SETTINGS: SalarySettings = {
  supervisorCanManageSalary: true,
  supervisorCanViewSalary: true,
  defaultSalaryCycleDay: 1,
  defaultPaymentDate: 7,
  companyName: 'Tumbledry Dry Clean & Laundry',
};

/**
 * Converts a numeric amount to Indian currency words (e.g. "Rupees Fifteen Thousand Two Hundred Only")
 */
export function numberToWordsIndian(amount: number): string {
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if (amount === 0) return 'Rupees Zero Only';
  if (amount < 0) return 'Minus ' + numberToWordsIndian(Math.abs(amount));

  const integerPart = Math.floor(amount);
  const paisePart = Math.round((amount - integerPart) * 100);

  function convertTwoDigits(n: number): string {
    if (n < 20) return units[n];
    return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + units[n % 10] : '');
  }

  function convertThreeDigits(n: number): string {
    const hundred = Math.floor(n / 100);
    const rem = n % 100;
    let res = '';
    if (hundred > 0) {
      res += units[hundred] + ' Hundred';
      if (rem > 0) res += ' ';
    }
    if (rem > 0) {
      res += convertTwoDigits(rem);
    }
    return res;
  }

  let crore = Math.floor(integerPart / 10000000);
  let rem = integerPart % 10000000;
  let lakh = Math.floor(rem / 100000);
  rem = rem % 100000;
  let thousand = Math.floor(rem / 1000);
  let hundred = rem % 1000;

  let words = 'Rupees ';
  if (crore > 0) words += convertTwoDigits(crore) + ' Crore ';
  if (lakh > 0) words += convertTwoDigits(lakh) + ' Lakh ';
  if (thousand > 0) words += convertTwoDigits(thousand) + ' Thousand ';
  if (hundred > 0) words += convertThreeDigits(hundred) + ' ';

  words = words.trim();
  if (paisePart > 0) {
    words += ' and ' + convertTwoDigits(paisePart) + ' Paise';
  }
  return words + ' Only';
}

/**
 * Get salary settings for a shop
 */
export async function getSalarySettings(shopId: string): Promise<SalarySettings> {
  const setting = await prisma.appSetting.findUnique({
    where: { shopId_key: { shopId, key: 'salary_settings' } },
  });
  if (!setting || !setting.value || typeof setting.value !== 'object') {
    return DEFAULT_SETTINGS;
  }
  return { ...DEFAULT_SETTINGS, ...(setting.value as Partial<SalarySettings>) };
}

/**
 * Update salary settings for a shop (Owner only)
 */
export async function updateSalarySettings(
  shopId: string,
  settings: Partial<SalarySettings>,
  actorAccountId: string
): Promise<SalarySettings> {
  const current = await getSalarySettings(shopId);
  const updated: SalarySettings = {
    ...current,
    ...settings,
    defaultSalaryCycleDay: Math.max(1, Math.min(28, Number(settings.defaultSalaryCycleDay || current.defaultSalaryCycleDay))),
    defaultPaymentDate: Math.max(1, Math.min(28, Number(settings.defaultPaymentDate || current.defaultPaymentDate))),
  };

  await prisma.appSetting.upsert({
    where: { shopId_key: { shopId, key: 'salary_settings' } },
    update: { value: updated as any },
    create: { shopId, key: 'salary_settings', value: updated as any },
  });

  await logAudit({
    shopId,
    actorAccountId,
    action: 'SETTINGS_UPDATE',
    entityType: 'Shop',
    entityId: shopId,
    metadata: { updatedKeys: Object.keys(settings), newSettings: updated },
  });

  return updated;
}

/**
 * Verify whether an authenticated account has salary access for this shop
 */
export async function canUserAccessSalary(
  auth: { isOwner: boolean; accountId: string; shopMemberships: Array<{ shopId: string; capabilities: string[] }> },
  shopId: string,
  requiredLevel: 'view' | 'manage',
  targetStaffMemberId?: string
): Promise<boolean> {
  if (auth.isOwner) return true;

  // Allow staff member to view their OWN salary & slip
  if (requiredLevel === 'view' && targetStaffMemberId) {
    const account = await prisma.account.findUnique({
      where: { id: auth.accountId },
      select: { staffMemberId: true },
    });
    if (account?.staffMemberId && account.staffMemberId === targetStaffMemberId) {
      return true;
    }
  }

  const membership = auth.shopMemberships.find((m) => m.shopId === shopId);
  if (!membership) return false;

  // Check if supervisor or holder of staff.manage capability
  const isSupervisorOrManager = membership.capabilities.some((c) =>
    ['staff.manage', 'staff.read', 'owner.all', 'shop.manage'].includes(c)
  );

  if (!isSupervisorOrManager) return false;

  // Check shop-level permission toggles configured by Owner
  const settings = await getSalarySettings(shopId);
  if (requiredLevel === 'manage') {
    return settings.supervisorCanManageSalary;
  }
  return settings.supervisorCanViewSalary || settings.supervisorCanManageSalary;
}

export interface MonthHolidayItem {
  date: string; // YYYY-MM-DD
  name: string; // e.g. "Weekly Off (Sunday)"
  type: 'WEEKLY_OFF' | 'STORE_HOLIDAY' | 'PAID_LEAVE';
}

export interface MonthHolidayConfig {
  month: string;
  weeklyOffDay: number; // 0 = Sunday, 1 = Monday, etc.
  holidays: MonthHolidayItem[];
}

/**
 * Get configured or auto-generated weekly offs and store holidays for a month
 */
export async function getShopMonthHolidays(shopId: string, monthStr: string): Promise<MonthHolidayConfig> {
  const settingKey = `holidays_${monthStr}`;
  const setting = await prisma.appSetting.findUnique({
    where: { shopId_key: { shopId, key: settingKey } },
  });

  if (setting?.value && typeof setting.value === 'object' && Array.isArray((setting.value as any).holidays)) {
    return setting.value as unknown as MonthHolidayConfig;
  }

  // Check if shop has a store-wide default weekly off day setting (Default: 3 = Wednesday)
  const shopDefaultSetting = await prisma.appSetting.findUnique({
    where: { shopId_key: { shopId, key: 'default_weekly_off_day' } },
  });
  const defaultOffDay =
    typeof shopDefaultSetting?.value === 'number'
      ? shopDefaultSetting.value
      : typeof (shopDefaultSetting?.value as any)?.day === 'number'
      ? (shopDefaultSetting?.value as any).day
      : 3; // 3 = Wednesday (Store Default)

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Generate default weekly offs for this month based on store default day
  const [yStr, mStr] = monthStr.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10) - 1;
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const defaultHolidays: MonthHolidayItem[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(y, m, day);
    if (d.getDay() === defaultOffDay) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      defaultHolidays.push({
        date: dateStr,
        name: `Weekly Off (${dayNames[defaultOffDay]})`,
        type: 'WEEKLY_OFF',
      });
    }
  }

  return {
    month: monthStr,
    weeklyOffDay: defaultOffDay,
    holidays: defaultHolidays,
  };
}

/**
 * Save store holidays and weekly offs for a month (Supervisor / Owner)
 */
export async function updateShopMonthHolidays(
  shopId: string,
  monthStr: string,
  data: { weeklyOffDay?: number; holidays: MonthHolidayItem[] },
  actorAccountId: string
): Promise<MonthHolidayConfig> {
  const targetOffDay = data.weeklyOffDay !== undefined ? data.weeklyOffDay : 3;
  const settingKey = `holidays_${monthStr}`;
  const config: MonthHolidayConfig = {
    month: monthStr,
    weeklyOffDay: targetOffDay,
    holidays: data.holidays || [],
  };

  await prisma.appSetting.upsert({
    where: { shopId_key: { shopId, key: settingKey } },
    update: { value: config as any },
    create: { shopId, key: settingKey, value: config as any },
  });

  // Also update shop's store-wide default weekly off day preference
  await prisma.appSetting.upsert({
    where: { shopId_key: { shopId, key: 'default_weekly_off_day' } },
    update: { value: targetOffDay as any },
    create: { shopId, key: 'default_weekly_off_day', value: targetOffDay as any },
  });

  await logAudit({
    shopId,
    actorAccountId,
    action: 'HOLIDAYS_UPDATE',
    entityType: 'Shop',
    entityId: shopId,
    metadata: { month: monthStr, holidaysCount: config.holidays.length },
  });

  return config;
}

/**
 * Parse month string "YYYY-MM" into start and end Date objects in local time
 */
export function getMonthCycleBounds(monthStr: string, cycleDay = 1): {
  periodStart: Date;
  periodEnd: Date;
  totalDaysInMonth: number;
  monthKey: string;
} {
  const [yearStr, monthNumStr] = monthStr.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthNumStr, 10) - 1; // 0-indexed

  if (cycleDay <= 1) {
    const periodStart = new Date(y, m, 1, 0, 0, 0, 0);
    const periodEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);
    const totalDaysInMonth = periodEnd.getDate();
    return { periodStart, periodEnd, totalDaysInMonth, monthKey: monthStr };
  } else {
    // Custom cycle e.g. 7th of prev month to 6th of target month
    const periodStart = new Date(y, m - 1, cycleDay, 0, 0, 0, 0);
    const periodEnd = new Date(y, m, cycleDay - 1, 23, 59, 59, 999);
    const diffTime = Math.abs(periodEnd.getTime() - periodStart.getTime());
    const totalDaysInMonth = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return { periodStart, periodEnd, totalDaysInMonth, monthKey: monthStr };
  }
}

/**
 * Calculates monthly salary, joining date pro-rata, attendance, and advances for a staff member
 */
export async function calculateStaffMonthSalary(
  shopId: string,
  staffMemberId: string,
  monthStr: string
) {
  // 1. Fetch Membership & Staff Details
  const membership = await prisma.shopMembership.findUnique({
    where: { shopId_staffMemberId: { shopId, staffMemberId } },
    include: {
      staffMember: true,
      positionCategory: true,
      shop: true,
    },
  });

  if (!membership) {
    throw new AppError(404, 'NOT_FOUND', 'Staff member is not part of this shop.');
  }

  const cycleDay = membership.salaryCycleDay || 1;
  const { periodStart, periodEnd, totalDaysInMonth } = getMonthCycleBounds(monthStr, cycleDay);

  let baseMonthlySalary = Number(membership.monthlySalary || 0);
  const fixedIncentive = Number(membership.incentiveAmount || 0);
  const joiningDate = membership.joiningDate ? new Date(membership.joiningDate) : null;

  // 2. Pro-rata joining date check
  let effectiveWorkingStart = periodStart;
  let isMidMonthJoined = false;
  let eligibleDays = totalDaysInMonth;

  if (joiningDate) {
    // If staff joined after periodEnd, they weren't employed yet during this month
    if (joiningDate > periodEnd) {
      eligibleDays = 0;
    } else if (joiningDate > periodStart) {
      // Joined mid-month!
      effectiveWorkingStart = new Date(joiningDate.getFullYear(), joiningDate.getMonth(), joiningDate.getDate(), 0, 0, 0, 0);
      isMidMonthJoined = true;

      // Calculate days from joiningDate up to periodEnd
      const msDiff = periodEnd.getTime() - effectiveWorkingStart.getTime();
      eligibleDays = Math.min(totalDaysInMonth, Math.max(0, Math.ceil(msDiff / (1000 * 60 * 60 * 24))));
    }
  }

  // 3. Query Attendance records within effective period
  const attendanceSessions = await prisma.attendanceSession.findMany({
    where: {
      shopId,
      staffMemberId,
      checkInAt: {
        gte: effectiveWorkingStart,
        lte: periodEnd,
      },
    },
    select: {
      id: true,
      checkInAt: true,
      checkOutAt: true,
      durationMinutes: true,
      status: true,
      attendanceType: true,
    },
  });

  // Calculate attendance counters
  let presentDays = 0;
  let halfDays = 0;

  for (const session of attendanceSessions) {
    if (session.attendanceType === 'PRESENT') {
      presentDays += 1;
    } else if (session.attendanceType === 'HALF_DAY') {
      halfDays += 1;
    } else if (session.attendanceType === 'LATE') {
      // Late check-in counts as full day unless defined otherwise
      presentDays += 1;
    } else if (session.checkInAt) {
      // Fallback: if checked in and not marked absent
      if (session.durationMinutes && session.durationMinutes < 240) {
        halfDays += 1;
      } else {
        presentDays += 1;
      }
    }
  }

  // 3.5. Fetch Store Month Calendar & Holidays (Weekly Offs, Festival Holidays)
  const holidayConfig = await getShopMonthHolidays(shopId, monthStr);
  const staffEligibleHolidays = holidayConfig.holidays.filter((h) => {
    const hDate = new Date(h.date + 'T00:00:00');
    return hDate >= effectiveWorkingStart && hDate <= periodEnd;
  });

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isCurrentMonth = monthStr === todayStr.slice(0, 7);
  const isPastMonth = monthStr < todayStr.slice(0, 7);
  const isFutureMonth = monthStr > todayStr.slice(0, 7);

  const totalHolidaysInMonth = staffEligibleHolidays.length;
  const scheduledWorkingDays = Math.max(1, eligibleDays - totalHolidaysInMonth);

  // Weekly offs & holidays passed up to today
  const pastHolidaysCount = staffEligibleHolidays.filter(
    (h) => h.date <= todayStr || isPastMonth
  ).length;

  // Calculate actual elapsed working days up to today (avoiding future unelapsed days being treated as absent!)
  let absentDays = 0;

  if (isFutureMonth) {
    absentDays = 0;
  } else if (isPastMonth) {
    // Whole month is completed
    absentDays = Math.max(0, scheduledWorkingDays - (presentDays + halfDays));
  } else if (isCurrentMonth) {
    // Current month in progress:
    // Only count scheduled working days up to today
    const effectiveStartDay = effectiveWorkingStart.getMonth() === now.getMonth() ? effectiveWorkingStart.getDate() : 1;
    const currentDay = Math.min(now.getDate(), totalDaysInMonth);

    // Check if staff has already checked in today
    const hasCheckInToday = attendanceSessions.some((s) => {
      const sDate = s.checkInAt ? new Date(s.checkInAt).toISOString().slice(0, 10) : '';
      return sDate === todayStr;
    });

    const todayIsHoliday = staffEligibleHolidays.some((h) => h.date === todayStr);
    const completedWorkingDaysBeforeToday = Math.max(
      0,
      (currentDay - 1 - effectiveStartDay + 1) - staffEligibleHolidays.filter((h) => h.date < todayStr).length
    );

    const workingDaysExpectedSoFar = completedWorkingDaysBeforeToday + (hasCheckInToday && !todayIsHoliday ? 1 : 0);
    absentDays = Math.max(0, workingDaysExpectedSoFar - (presentDays + halfDays));
  }

  // Paid Days: Present + Half Days + Scheduled Weekly Offs (Paid)
  const paidDays = Math.min(
    eligibleDays,
    Math.round((presentDays + 0.5 * halfDays + totalHolidaysInMonth) * 100) / 100
  );

  // 4. Calculate Base Salary & Daily Rate
  const isTemporary = (membership as any).isTemporary === true;
  const wageType = (membership as any).wageType || 'MONTHLY';
  const dailyWageRate = (membership as any).dailyWageRate ? Number((membership as any).dailyWageRate) : null;

  baseMonthlySalary = Number(membership.monthlySalary || 0);
  let perDayRate = 0;
  let earnedSalary = 0;

  if (isTemporary && wageType === 'DAILY' && dailyWageRate != null) {
    // Daily wage worker: paid directly per day worked
    perDayRate = dailyWageRate;
    baseMonthlySalary = Math.round(dailyWageRate * scheduledWorkingDays);
    earnedSalary = Math.round(dailyWageRate * (presentDays + 0.5 * halfDays));
  } else {
    // Salaried staff: salary based on scheduled working days target
    perDayRate = scheduledWorkingDays > 0 ? baseMonthlySalary / scheduledWorkingDays : 0;
    
    let effectiveBaseSalary = baseMonthlySalary;
    if (isMidMonthJoined && totalDaysInMonth > 0) {
      effectiveBaseSalary = Math.round((baseMonthlySalary * eligibleDays) / totalDaysInMonth);
    }

    // Absent deduction: only deduct for real absent days!
    const absentDeduction = Math.round((absentDays * perDayRate) + (0.5 * halfDays * perDayRate));
    earnedSalary = Math.max(0, effectiveBaseSalary - absentDeduction);
  }

  // 5. Query Advances & Deductions for this staff in target period
  const advancesRecords = await prisma.staffAdvanceDeduction.findMany({
    where: {
      shopId,
      staffMemberId,
      status: 'APPLIED',
      OR: [
        { targetMonth: monthStr },
        {
          targetMonth: null,
          date: { gte: periodStart, lte: periodEnd },
        },
      ],
    },
    orderBy: { date: 'asc' },
  });

  let totalAdvances = 0;
  let totalOtherDeductions = 0;
  let totalBonus = 0;

  for (const record of advancesRecords) {
    const amt = Number(record.amount || 0);
    if (record.type === 'ADVANCE' || record.type === 'LOAN') {
      totalAdvances += amt;
    } else if (record.type === 'DEDUCTION' || record.type === 'PENALTY') {
      totalOtherDeductions += amt;
    } else if (record.type === 'BONUS' || record.type === 'INCENTIVE_ADJUSTMENT') {
      totalBonus += amt;
    }
  }

  // 6. Net Financials
  const grossPayable = Math.max(0, earnedSalary + fixedIncentive + totalBonus);
  const totalDeductions = totalAdvances + totalOtherDeductions;
  const netPayable = Math.max(0, grossPayable - totalDeductions);

  // 7. Check if existing processed / paid record exists
  const savedPayment = await prisma.staffSalaryPayment.findUnique({
    where: { shopId_staffMemberId_month: { shopId, staffMemberId, month: monthStr } },
    include: {
      generatedBy: { select: { id: true, username: true } },
    },
  });

  // Helper to format IST time
  const formatIST = (date: Date | null | undefined): string | null => {
    if (!date) return null;
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  };

  // 8. Generate Daily Breakdown for all days in the month
  const dailyBreakdown: Array<{
    date: string;
    dayNumber: number;
    dayName: string;
    status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'WEEKLY_OFF' | 'HOLIDAY' | 'FUTURE' | 'NOT_EMPLOYED';
    statusLabel: string;
    holidayName?: string;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    durationMinutes?: number | null;
    transactions: Array<{
      id: string;
      type: string;
      amount: number;
      reason: string;
      paymentMode: string;
    }>;
  }> = [];

  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
    const dayDate = new Date(`${dateStr}T00:00:00`);
    const dayName = dayDate.toLocaleDateString('en-IN', { weekday: 'short' });

    // Find holiday / weekly off
    const holiday = staffEligibleHolidays.find((h) => h.date === dateStr);

    // Find attendance session
    const session = attendanceSessions.find((s) => {
      const sDate = s.checkInAt ? new Date(s.checkInAt).toISOString().slice(0, 10) : '';
      return sDate === dateStr;
    });

    // Find transactions on this date
    const dayTransactions = advancesRecords
      .filter((a) => {
        const aDate = a.date ? new Date(a.date).toISOString().slice(0, 10) : '';
        return aDate === dateStr;
      })
      .map((a) => ({
        id: a.id,
        type: a.type,
        amount: Number(a.amount || 0),
        reason: a.reason,
        paymentMode: a.paymentMode,
      }));

    let status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'WEEKLY_OFF' | 'HOLIDAY' | 'FUTURE' | 'NOT_EMPLOYED';
    let statusLabel = '';

    if (dayDate < effectiveWorkingStart) {
      status = 'NOT_EMPLOYED';
      statusLabel = 'Not Joined Yet';
    } else if (isFutureMonth || (isCurrentMonth && dateStr > todayStr)) {
      status = 'FUTURE';
      statusLabel = 'Upcoming';
    } else if (holiday) {
      status = holiday.type === 'STORE_HOLIDAY' ? 'HOLIDAY' : 'WEEKLY_OFF';
      statusLabel = holiday.name || (status === 'WEEKLY_OFF' ? 'Weekly Off' : 'Holiday');
    } else if (session) {
      if (session.attendanceType === 'HALF_DAY' || (session.durationMinutes && session.durationMinutes < 240)) {
        status = 'HALF_DAY';
        statusLabel = 'Half Day';
      } else {
        status = 'PRESENT';
        statusLabel = session.attendanceType === 'LATE' ? 'Present (Late)' : 'Present';
      }
    } else if (isCurrentMonth && dateStr === todayStr && !holiday) {
      status = 'ABSENT';
      statusLabel = 'Not Marked Today';
    } else {
      status = 'ABSENT';
      statusLabel = 'Absent';
    }

    dailyBreakdown.push({
      date: dateStr,
      dayNumber: d,
      dayName,
      status,
      statusLabel,
      holidayName: holiday?.name,
      checkInTime: formatIST(session?.checkInAt),
      checkOutTime: formatIST(session?.checkOutAt),
      durationMinutes: session?.durationMinutes,
      transactions: dayTransactions,
    });
  }

  return {
    staffMember: {
      id: membership.staffMember.id,
      fullName: membership.staffMember.fullName,
      mobile: membership.staffMember.mobile,
      address: membership.staffMember.address,
      profilePhotoPath: membership.staffMember.profilePhotoPath,
      designation: membership.positionCategory?.name || 'Staff Member',
    },
    membership: {
      joiningDate: membership.joiningDate,
      monthlySalary: baseMonthlySalary,
      incentiveAmount: fixedIncentive,
      salaryCycleDay: membership.salaryCycleDay || 1,
      salaryPaymentDate: membership.salaryPaymentDate || 7,
      salaryNotes: membership.salaryNotes,
      attendanceEnabled: membership.attendanceEnabled,
      isTemporary,
      wageType,
      dailyWageRate,
    },
    month: monthStr,
    cycleBounds: {
      periodStart,
      periodEnd,
      totalDaysInMonth,
      effectiveWorkingStart,
      isMidMonthJoined,
      eligibleDays,
    },
    attendance: {
      presentDays,
      halfDays,
      absentDays,
      weeklyOffDays: totalHolidaysInMonth,
      scheduledWorkingDays,
      paidDays,
      totalSessionsRecorded: attendanceSessions.length,
      isTemporary,
      wageType,
      dailyWageRate,
    },
    holidays: {
      totalHolidaysInMonth,
      pastHolidaysCount,
      scheduledWorkingDays,
    },
    calculation: {
      baseMonthlySalary,
      perDayRate: Math.round(perDayRate * 100) / 100,
      earnedSalary,
      fixedIncentive,
      bonusAmount: totalBonus,
      grossPayable,
      advanceDeducted: totalAdvances,
      otherDeductions: totalOtherDeductions,
      totalDeductions,
      netPayable: savedPayment ? Number(savedPayment.netPayable) : netPayable,
    },
    advancesList: advancesRecords.map((r) => ({
      id: r.id,
      type: r.type,
      amount: Number(r.amount),
      date: r.date,
      reason: r.reason,
      paymentMode: r.paymentMode,
      status: r.status,
    })),
    savedPayment: savedPayment
      ? {
          id: savedPayment.id,
          status: savedPayment.status,
          netPayable: Number(savedPayment.netPayable),
          paidDate: savedPayment.paidDate,
          paymentMode: savedPayment.paymentMode,
          transactionRef: savedPayment.transactionRef,
          remarks: savedPayment.remarks,
          generatedAt: savedPayment.createdAt,
          generatedBy: savedPayment.generatedBy?.username,
        }
      : null,
    dailyBreakdown,
  };
}

/**
 * Summary for the whole shop for a specific month (with filters and search)
 */
export async function getShopSalarySummary(
  shopId: string,
  monthStr: string,
  search?: string
) {
  const settings = await getSalarySettings(shopId);

  // Fetch all active staff in this shop
  const memberships = await prisma.shopMembership.findMany({
    where: {
      shopId,
      isActive: true,
      ...(search
        ? {
            staffMember: {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' } },
                { mobile: { contains: search } },
              ],
            },
          }
        : {}),
    },
    include: {
      staffMember: true,
      positionCategory: true,
    },
    orderBy: { staffMember: { fullName: 'asc' } },
  });

  // Calculate salary for each staff in parallel
  const staffCalculations = await Promise.all(
    memberships.map((m) => calculateStaffMonthSalary(shopId, m.staffMemberId, monthStr))
  );

  let totalPayrollBudget = 0;
  let totalEarnedSalary = 0;
  let totalAdvances = 0;
  let totalDeductions = 0;
  let totalNetPayable = 0;
  let totalPaidAmount = 0;
  let paidCount = 0;
  let pendingCount = 0;

  for (const calc of staffCalculations) {
    totalPayrollBudget += calc.calculation.baseMonthlySalary;
    totalEarnedSalary += calc.calculation.earnedSalary;
    totalAdvances += calc.calculation.advanceDeducted;
    totalDeductions += calc.calculation.totalDeductions;
    totalNetPayable += calc.calculation.netPayable;

    if (calc.savedPayment?.status === 'PAID') {
      paidCount += 1;
      totalPaidAmount += calc.savedPayment.netPayable;
    } else {
      pendingCount += 1;
    }
  }

  return {
    shopId,
    month: monthStr,
    settings,
    metrics: {
      totalStaff: staffCalculations.length,
      totalPayrollBudget,
      totalEarnedSalary,
      totalAdvances,
      totalDeductions,
      totalNetPayable,
      totalPaidAmount,
      paidCount,
      pendingCount,
    },
    staffList: staffCalculations,
  };
}

/**
 * Get comprehensive formatted payslip data ready for viewing or printing
 */
export async function getStaffPayslipData(
  shopId: string,
  staffMemberId: string,
  monthStr: string
) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      id: true,
      name: true,
      code: true,
      address: true,
      contactInfo: true,
      logoPath: true,
    },
  });

  if (!shop) throw new AppError(404, 'NOT_FOUND', 'Shop not found.');

  const settings = await getSalarySettings(shopId);
  const data = await calculateStaffMonthSalary(shopId, staffMemberId, monthStr);

  const netPayable = data.savedPayment ? data.savedPayment.netPayable : data.calculation.netPayable;
  const netPayableWords = numberToWordsIndian(netPayable);

  return {
    shop: {
      ...shop,
      brandName: settings.companyName || 'Tumbledry Dry Clean & Laundry',
    },
    payslip: {
      month: monthStr,
      monthFormatted: new Date(monthStr + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      periodStart: data.cycleBounds.periodStart,
      periodEnd: data.cycleBounds.periodEnd,
      isMidMonthJoined: data.cycleBounds.isMidMonthJoined,
      eligibleDays: data.cycleBounds.eligibleDays,
      totalDaysInMonth: data.cycleBounds.totalDaysInMonth,
    },
    staff: data.staffMember,
    membership: data.membership,
    attendance: data.attendance,
    earnings: {
      baseMonthlySalary: data.calculation.baseMonthlySalary,
      dailyRate: data.calculation.perDayRate,
      earnedSalary: data.calculation.earnedSalary,
      fixedIncentive: data.calculation.fixedIncentive,
      bonusAmount: data.calculation.bonusAmount,
      grossEarnings: data.calculation.grossPayable,
    },
    deductions: {
      advanceDeducted: data.calculation.advanceDeducted,
      otherDeductions: data.calculation.otherDeductions,
      totalDeductions: data.calculation.totalDeductions,
      itemizedAdvances: data.advancesList,
    },
    netPayable,
    netPayableWords,
    paymentStatus: data.savedPayment?.status || 'PENDING',
    paymentDetails: data.savedPayment
      ? {
          paidDate: data.savedPayment.paidDate,
          paymentMode: data.savedPayment.paymentMode,
          transactionRef: data.savedPayment.transactionRef,
          remarks: data.savedPayment.remarks,
        }
      : null,
  };
}

/**
 * Record a new advance, deduction, or bonus for a staff member
 */
export async function recordAdvanceDeduction(
  shopId: string,
  payload: {
    staffMemberId: string;
    type: 'ADVANCE' | 'DEDUCTION' | 'BONUS' | 'PENALTY' | 'LOAN';
    amount: number;
    date: string;
    targetMonth?: string;
    reason: string;
    paymentMode?: string;
  },
  actorAccountId: string
) {
  if (!payload.amount || payload.amount <= 0) {
    throw new AppError(400, 'BAD_REQUEST', 'Amount must be greater than 0.');
  }
  if (!payload.reason || payload.reason.trim().length === 0) {
    throw new AppError(400, 'BAD_REQUEST', 'Reason is required.');
  }

  const dateObj = new Date(payload.date || new Date().toISOString());

  const record = await prisma.staffAdvanceDeduction.create({
    data: {
      shopId,
      staffMemberId: payload.staffMemberId,
      type: payload.type || 'ADVANCE',
      amount: payload.amount,
      date: dateObj,
      targetMonth: payload.targetMonth || null,
      reason: payload.reason.trim(),
      paymentMode: payload.paymentMode || 'CASH',
      status: 'APPLIED',
      recordedByAccountId: actorAccountId,
    },
    include: {
      staffMember: { select: { fullName: true } },
    },
  });

  await logAudit({
    shopId,
    actorAccountId,
    action: 'CREATE',
    entityType: 'StaffAdvanceDeduction',
    entityId: record.id,
    metadata: {
      staffMemberId: payload.staffMemberId,
      staffName: record.staffMember.fullName,
      type: payload.type,
      amount: payload.amount,
      reason: payload.reason,
    },
  });

  return record;
}

/**
 * List all advances, loans, deductions with filters
 */
export async function listAdvanceDeductions(
  shopId: string,
  filter: {
    staffMemberId?: string;
    targetMonth?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
  }
) {
  const where: any = { shopId };

  if (filter.staffMemberId) where.staffMemberId = filter.staffMemberId;
  if (filter.targetMonth) where.targetMonth = filter.targetMonth;
  if (filter.type) where.type = filter.type;
  if (filter.startDate || filter.endDate) {
    where.date = {};
    if (filter.startDate) where.date.gte = new Date(filter.startDate);
    if (filter.endDate) where.date.lte = new Date(filter.endDate);
  }

  const records = await prisma.staffAdvanceDeduction.findMany({
    where,
    orderBy: { date: 'desc' },
    include: {
      staffMember: { select: { id: true, fullName: true, mobile: true } },
      recordedBy: { select: { id: true, username: true } },
    },
  });

  return records.map((r) => ({
    id: r.id,
    staffMemberId: r.staffMemberId,
    staffName: r.staffMember.fullName,
    mobile: r.staffMember.mobile,
    type: r.type,
    amount: Number(r.amount),
    date: r.date,
    targetMonth: r.targetMonth,
    reason: r.reason,
    paymentMode: r.paymentMode,
    status: r.status,
    recordedBy: r.recordedBy.username,
    createdAt: r.createdAt,
  }));
}

/**
 * Delete or waive an advance entry
 */
export async function deleteAdvanceDeduction(shopId: string, id: string, actorAccountId: string) {
  const record = await prisma.staffAdvanceDeduction.findUnique({
    where: { id },
  });
  if (!record || record.shopId !== shopId) {
    throw new AppError(404, 'NOT_FOUND', 'Record not found.');
  }

  await prisma.staffAdvanceDeduction.delete({ where: { id } });

  await logAudit({
    shopId,
    actorAccountId,
    action: 'DELETE',
    entityType: 'StaffAdvanceDeduction',
    entityId: id,
    metadata: { amount: Number(record.amount), reason: record.reason },
  });

  return { success: true };
}

/**
 * Process or Mark a monthly salary slip as PAID or PROCESSED
 */
export async function processSalaryPayment(
  shopId: string,
  staffMemberId: string,
  monthStr: string,
  payload: {
    status: 'PAID' | 'PROCESSED' | 'ON_HOLD' | 'DRAFT';
    paymentMode?: string;
    paidDate?: string;
    transactionRef?: string;
    remarks?: string;
  },
  actorAccountId: string
) {
  // Re-calculate live numbers to ensure consistency
  const calculated = await calculateStaffMonthSalary(shopId, staffMemberId, monthStr);

  const paymentRecord = await prisma.staffSalaryPayment.upsert({
    where: { shopId_staffMemberId_month: { shopId, staffMemberId, month: monthStr } },
    update: {
      status: payload.status,
      paymentMode: payload.paymentMode || 'BANK_TRANSFER',
      paidDate: payload.paidDate ? new Date(payload.paidDate) : payload.status === 'PAID' ? new Date() : null,
      transactionRef: payload.transactionRef || null,
      remarks: payload.remarks || null,
      netPayable: calculated.calculation.netPayable,
      grossPayable: calculated.calculation.grossPayable,
      earnedSalary: calculated.calculation.earnedSalary,
      advanceDeducted: calculated.calculation.advanceDeducted,
      otherDeductions: calculated.calculation.otherDeductions,
      presentDays: calculated.attendance.presentDays,
      halfDays: calculated.attendance.halfDays,
      absentDays: calculated.attendance.absentDays,
      paidDays: calculated.attendance.paidDays,
      eligibleDays: calculated.cycleBounds.eligibleDays,
      totalDaysInMonth: calculated.cycleBounds.totalDaysInMonth,
      baseSalary: calculated.calculation.baseMonthlySalary,
      incentiveAmount: calculated.calculation.fixedIncentive,
      bonusAmount: calculated.calculation.bonusAmount,
    },
    create: {
      shopId,
      staffMemberId,
      month: monthStr,
      periodStart: calculated.cycleBounds.periodStart,
      periodEnd: calculated.cycleBounds.periodEnd,
      joiningDate: calculated.membership.joiningDate,
      baseSalary: calculated.calculation.baseMonthlySalary,
      totalDaysInMonth: calculated.cycleBounds.totalDaysInMonth,
      eligibleDays: calculated.cycleBounds.eligibleDays,
      presentDays: calculated.attendance.presentDays,
      halfDays: calculated.attendance.halfDays,
      absentDays: calculated.attendance.absentDays,
      paidDays: calculated.attendance.paidDays,
      earnedSalary: calculated.calculation.earnedSalary,
      incentiveAmount: calculated.calculation.fixedIncentive,
      bonusAmount: calculated.calculation.bonusAmount,
      grossPayable: calculated.calculation.grossPayable,
      advanceDeducted: calculated.calculation.advanceDeducted,
      otherDeductions: calculated.calculation.otherDeductions,
      netPayable: calculated.calculation.netPayable,
      status: payload.status,
      paidDate: payload.paidDate ? new Date(payload.paidDate) : payload.status === 'PAID' ? new Date() : null,
      paymentMode: payload.paymentMode || 'BANK_TRANSFER',
      transactionRef: payload.transactionRef || null,
      remarks: payload.remarks || null,
      generatedByAccountId: actorAccountId,
    },
  });

  await logAudit({
    shopId,
    actorAccountId,
    action: payload.status === 'PAID' ? 'SALARY_PAID' : 'SALARY_PROCESSED',
    entityType: 'StaffSalaryPayment',
    entityId: paymentRecord.id,
    metadata: {
      staffMemberId,
      month: monthStr,
      netPayable: Number(paymentRecord.netPayable),
      status: payload.status,
    },
  });

  return paymentRecord;
}

/**
 * Update staff salary terms (joining date, base monthly salary, cycle day, payout date, notes)
 */
export async function updateStaffSalaryTerms(
  shopId: string,
  staffMemberId: string,
  payload: {
    monthlySalary?: number;
    incentiveAmount?: number;
    joiningDate?: string | null;
    salaryCycleDay?: number;
    salaryPaymentDate?: number;
    salaryNotes?: string;
    wageType?: string;
    dailyWageRate?: number | null;
  },
  actorAccountId: string
) {
  const membership = await prisma.shopMembership.findUnique({
    where: { shopId_staffMemberId: { shopId, staffMemberId } },
  });
  if (!membership) {
    throw new AppError(404, 'NOT_FOUND', 'Membership not found.');
  }

  const updateData: any = {};
  if (payload.monthlySalary !== undefined) updateData.monthlySalary = payload.monthlySalary;
  if (payload.incentiveAmount !== undefined) updateData.incentiveAmount = payload.incentiveAmount;
  if (payload.joiningDate !== undefined) {
    updateData.joiningDate = payload.joiningDate ? new Date(payload.joiningDate) : null;
  }
  if (payload.salaryCycleDay !== undefined) {
    updateData.salaryCycleDay = Math.max(1, Math.min(28, Number(payload.salaryCycleDay)));
  }
  if (payload.salaryPaymentDate !== undefined) {
    updateData.salaryPaymentDate = Math.max(1, Math.min(28, Number(payload.salaryPaymentDate)));
  }
  if (payload.salaryNotes !== undefined) updateData.salaryNotes = payload.salaryNotes;
  if (payload.wageType !== undefined) updateData.wageType = payload.wageType;
  if (payload.dailyWageRate !== undefined) updateData.dailyWageRate = payload.dailyWageRate;

  const updated = await prisma.shopMembership.update({
    where: { shopId_staffMemberId: { shopId, staffMemberId } },
    data: updateData,
  });

  await logAudit({
    shopId,
    actorAccountId,
    action: 'UPDATE',
    entityType: 'ShopMembership',
    entityId: updated.id,
    metadata: { updatedSalaryTerms: payload },
  });

  return updated;
}

/**
 * Creates a Temporary Staff member (no login account, used for salary and expense management)
 */
export async function createTemporaryStaff(
  shopId: string,
  data: {
    fullName: string;
    mobile?: string;
    address?: string;
    roleDescription?: string;
    wageType: 'MONTHLY' | 'DAILY';
    amount: number;
    joiningDate?: string;
    notes?: string;
  },
  actorAccountId: string
) {
  // 1. Create StaffMember profile
  const staff = await prisma.staffMember.create({
    data: {
      fullName: data.fullName.trim(),
      mobile: data.mobile?.trim() || null,
      address: data.address?.trim() || null,
    },
  });

  // 2. Find or create Position Category
  const posName = data.roleDescription?.trim() || 'Temporary Staff';
  let positionCategory = await prisma.positionCategory.findFirst({
    where: {
      name: { equals: posName, mode: 'insensitive' },
      OR: [{ shopId }, { shopId: null }],
    },
  });
  if (!positionCategory) {
    positionCategory = await prisma.positionCategory.create({
      data: { name: posName, shopId },
    });
  }

  // 3. Resolve default permission profile
  const profile =
    (await prisma.permissionProfile.findFirst({ where: { id: 'sys-washerman' } })) ||
    (await prisma.permissionProfile.findFirst());

  if (!profile) {
    throw new AppError(500, 'SERVER_ERROR', 'No permission profile available.');
  }

  // 4. Create ShopMembership with isTemporary: true and NO account
  const membership = await prisma.shopMembership.create({
    data: {
      shopId,
      staffMemberId: staff.id,
      accountId: null, // No login access
      permissionProfileId: profile.id,
      positionCategoryId: positionCategory.id,
      isTemporary: true,
      wageType: data.wageType,
      monthlySalary: data.wageType === 'MONTHLY' ? data.amount : null,
      dailyWageRate: data.wageType === 'DAILY' ? data.amount : null,
      joiningDate: data.joiningDate ? new Date(data.joiningDate) : new Date(),
      salaryNotes: data.notes?.trim() || null,
      attendanceEnabled: false,
    } as any,
    include: {
      staffMember: true,
      positionCategory: true,
    },
  });

  await logAudit({
    shopId,
    actorAccountId,
    action: 'STAFF_CREATE_TEMPORARY',
    entityType: 'StaffMember',
    entityId: staff.id,
    metadata: {
      fullName: data.fullName,
      wageType: data.wageType,
      amount: data.amount,
      roleDescription: posName,
    },
  });

  return membership;
}
