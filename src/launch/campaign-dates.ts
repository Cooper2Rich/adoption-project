const chicago = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// A nonexistent/ambiguous DST wall time needs an unambiguous manager choice;
// never silently shift the locked earning boundary by an hour.
export function chicagoInstant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Choose a valid Chicago date and time");
  const wall = Date.parse(`${value}:00.000Z`);
  const matches = [5, 6]
    .map((offset) => wall + offset * 3600000)
    .filter(
      (at) =>
        Number.isFinite(at) && chicago.format(at).replace(" ", "T") === value,
    );
  if (matches.length !== 1)
    throw new Error(
      "Choose an unambiguous Chicago time outside the daylight-saving clock change",
    );
  return new Date(matches[0]).toISOString();
}
