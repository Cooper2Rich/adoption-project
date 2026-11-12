const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const clock = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Chicago",
});
export const money = (cents: number) => currency.format(cents / 100);
export const timestamp = (at: number) =>
  Number.isFinite(at) && !Number.isNaN(new Date(at).valueOf())
    ? clock.format(at)
    : "Invalid evidence timestamp";

export function dollars(value: string): number {
  if (!/^\d+(\.\d{0,2})?$/.test(value))
    throw new Error(
      "Enter a nonnegative dollar amount with up to two decimal places.",
    );
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("This amount is too large.");
  return Number(cents);
}
