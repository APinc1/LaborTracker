// server/lib/dates.ts
export function nextWeekday(d: Date): Date {
  const day = d.getDay();             // 0=Sun … 6=Sat
  if (day === 6) d.setDate(d.getDate() + 2);    // Sat -> Mon
  else if (day === 0) d.setDate(d.getDate() + 1); // Sun -> Mon
  return d;
}