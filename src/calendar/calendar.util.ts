const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Date → 'YYYY-MM-DD' (로컬 기준, seed-calendar·risk-gate 와 정합). */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 주말(토/일) 여부 (로컬 기준). */
export function isWeekend(date: Date): boolean {
  const day = date.getDay(); // 0=일, 6=토
  return day === 0 || day === 6;
}

/** [from, to] 구간의 각 날짜를 순회한다 (자정 정렬, 경계 포함). */
export function eachDay(from: Date, to: Date): Date[] {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += MS_PER_DAY) {
    days.push(new Date(t));
  }
  return days;
}
