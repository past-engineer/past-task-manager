export const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" や ISO 文字列を UTC 深夜0時の ms に正規化。null は null のまま */
export function dayValue(s: string | null | undefined): number | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** UTC 深夜0時の ms → "YYYY-MM-DD" */
export function isoOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** ローカルの「今日」を UTC 深夜0時の ms で返す */
export function todayMs(): number {
  const d = new Date();
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isWeekend(ms: number): boolean {
  const dow = new Date(ms).getUTCDay();
  return dow === 0 || dow === 6;
}

/** 曜日（0=日 〜 6=土） */
export function weekdayOf(ms: number): number {
  return new Date(ms).getUTCDay();
}

export function dayOfMonth(ms: number): number {
  return new Date(ms).getUTCDate();
}

export function fmtMD(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function monthLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`;
}

export type IsOffFn = (dayMs: number) => boolean;

/** [s..e] に含まれる稼働日数 */
export function countWorkingDays(s: number, e: number, isOff: IsOffFn): number {
  let n = 0;
  for (let d = s; d <= e; d += DAY_MS) if (!isOff(d)) n++;
  return n;
}

/** d 以降で最初の稼働日 */
export function nextWorkingDay(d: number, isOff: IsOffFn): number {
  let x = d;
  for (let i = 0; i < 370 && isOff(x); i++) x += DAY_MS;
  return x;
}

/** d 以前で最初の稼働日 */
export function prevWorkingDay(d: number, isOff: IsOffFn): number {
  let x = d;
  for (let i = 0; i < 370 && isOff(x); i++) x -= DAY_MS;
  return x;
}

/** start（稼働日）から稼働日 n 日分をカバーする終了日（非稼働日を跨ぐ） */
export function spanWorkingDays(
  start: number,
  n: number,
  isOff: IsOffFn
): number {
  let end = start;
  let count = isOff(start) ? 0 : 1;
  for (let i = 0; i < 1000 && count < n; i++) {
    end += DAY_MS;
    if (!isOff(end)) count++;
  }
  return end;
}

/** タスク群と今日から表示レンジ（UTC ms の日配列）を作る */
export function buildRange(
  dates: (number | null)[],
  padBefore = 7,
  padAfter = 14
): { min: number; max: number; days: number[] } {
  const t = todayMs();
  let min = t - padBefore * DAY_MS;
  let max = t + 30 * DAY_MS;
  for (const v of dates) {
    if (v === null) continue;
    if (v - padBefore * DAY_MS < min) min = v - padBefore * DAY_MS;
    if (v + padAfter * DAY_MS > max) max = v + padAfter * DAY_MS;
  }
  const days: number[] = [];
  for (let d = min; d <= max; d += DAY_MS) days.push(d);
  return { min, max, days };
}
