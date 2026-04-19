/** Admin `datetime-local` values are interpreted as Asia/Tokyo civil time. */

const TZ = "Asia/Tokyo";

export function utcMsToTokyoDatetimeLocalValue(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Returns UTC ms, or null if empty/invalid. */
export function tokyoDatetimeLocalToUtcMs(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const hasSeconds = /T\d{2}:\d{2}:\d{2}/.test(v);
  const withZone = hasSeconds ? `${v}+09:00` : `${v}:00+09:00`;
  const parsed = Date.parse(withZone);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

export function formatScheduleTokyo(
  startAt: number,
  opts?: { durationRegulationMinutes?: number; court?: string; finalsHint?: boolean }
): string {
  const time = new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(startAt));
  const dur =
    opts?.durationRegulationMinutes ?? 16;
  let s = `${time} · ${dur} min (reg.)`;
  if (opts?.finalsHint) {
    s += " · +8 min extra if tied";
  }
  if (opts?.court) {
    s += ` · ${opts.court}`;
  }
  return s;
}
