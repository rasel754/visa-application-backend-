export function getDhakaTodayStartUtc(): Date {
  // Start of current day in Asia/Dhaka (+06:00)
  const now = new Date();
  const dhakaOffsetMs = 6 * 60 * 60 * 1000;
  const dhakaNow = new Date(now.getTime() + dhakaOffsetMs);
  const startOfDhakaDayMs = Date.UTC(
    dhakaNow.getUTCFullYear(),
    dhakaNow.getUTCMonth(),
    dhakaNow.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  return new Date(startOfDhakaDayMs - dhakaOffsetMs);
}

export function parseDateBoundary(value: string, endOfDay: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const iso = endOfDay ? `${value}T23:59:59.999+06:00` : `${value}T00:00:00.000+06:00`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

