export const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

export function toDhakaDate(date: Date = new Date()): Date {
  return new Date(date.getTime() + DHAKA_OFFSET_MS);
}

export function toDhakaYmd(date: Date = new Date()): string {
  const d = toDhakaDate(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDhakaTodayStartUtc(): Date {
  // Start of current day in Asia/Dhaka (+06:00)
  const dhakaNow = toDhakaDate(new Date());
  const startOfDhakaDayMs = Date.UTC(
    dhakaNow.getUTCFullYear(),
    dhakaNow.getUTCMonth(),
    dhakaNow.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  return new Date(startOfDhakaDayMs - DHAKA_OFFSET_MS);
}

export function getDhakaRollingDaysStartUtc(days: number): Date {
  const todayStart = getDhakaTodayStartUtc();
  return new Date(todayStart.getTime() - Math.max(0, days - 1) * 24 * 60 * 60 * 1000);
}

export function getDhakaMonthStartUtc(): Date {
  const dhakaNow = toDhakaDate(new Date());
  const startOfMonthMs = Date.UTC(
    dhakaNow.getUTCFullYear(),
    dhakaNow.getUTCMonth(),
    1,
    0,
    0,
    0,
    0,
  );
  return new Date(startOfMonthMs - DHAKA_OFFSET_MS);
}

export function getDhakaThisWeekStartUtc(): Date {
  const dhakaNow = toDhakaDate(new Date());
  const dayOfWeek = (dhakaNow.getUTCDay() + 6) % 7; // 0=Mon, 6=Sun
  const startOfWeekMs =
    Date.UTC(dhakaNow.getUTCFullYear(), dhakaNow.getUTCMonth(), dhakaNow.getUTCDate()) -
    dayOfWeek * 86400000;
  return new Date(startOfWeekMs - DHAKA_OFFSET_MS);
}

export function getDhakaThisMonthStartUtc(): Date {
  return getDhakaMonthStartUtc();
}

const MONTH_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function parseDhakaMonthBoundary(
  ym: string,
): { startUtc: Date; endUtc: Date; label: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!match) return null;
  const year = Number.parseInt(match[1]!, 10);
  const monthNum = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(year) || monthNum < 1 || monthNum > 12) return null;
  const startUtc = new Date(Date.UTC(year, monthNum - 1, 1) - DHAKA_OFFSET_MS);
  const endUtc = new Date(Date.UTC(year, monthNum, 1) - DHAKA_OFFSET_MS);
  const label = `${MONTH_FULL[monthNum - 1]!} ${year}`;
  return { startUtc, endUtc, label };
}

export function parseDateBoundary(value: string, endOfDay: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const iso = endOfDay ? `${value}T23:59:59.999+06:00` : `${value}T00:00:00.000+06:00`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

