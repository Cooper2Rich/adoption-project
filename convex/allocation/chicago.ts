const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function parts(at: number) {
  const values = Object.fromEntries(
    formatter.formatToParts(at).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function midnight(year: number, month: number, day: number): number {
  const utc = Date.UTC(year, month - 1, day);
  let candidate = utc + 6 * 3600000;
  for (let i = 0; i < 3; i++) {
    const p = parts(candidate);
    const wall = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second,
    );
    candidate += utc - wall;
  }
  return candidate;
}

export function chicagoDay(at: number) {
  const p = parts(at);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return {
    label: `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`,
    start: midnight(p.year, p.month, p.day),
    end: midnight(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
    ),
  };
}

export function firstDayBaseline(
  daily: bigint,
  admittedAt: number,
  at: number,
  day: ReturnType<typeof chicagoDay>,
): bigint {
  if (!Number.isSafeInteger(admittedAt) || admittedAt < 0 || admittedAt > at)
    throw new Error("Invalid paid admission timestamp");
  const remaining = BigInt(day.end - Math.max(day.start, admittedAt));
  const duration = BigInt(day.end - day.start);
  return (daily * remaining * 2n + duration) / (2n * duration);
}
