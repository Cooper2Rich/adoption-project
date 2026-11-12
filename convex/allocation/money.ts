export function money(value: number, signed = false): bigint {
  if (!Number.isSafeInteger(value) || (!signed && value < 0))
    throw new Error("Money must use safe whole USD cents");
  return BigInt(value);
}

export function integer(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new Error("Amount exceeds safe integer bounds");
  return result;
}

export function percentage(value: number): [bigint, bigint] {
  if (!Number.isFinite(value) || value < 0 || value > 100)
    throw new Error("Percentages must be between zero and 100");
  const [coefficient, exponent = "0"] = String(value).toLowerCase().split("e");
  const decimals = coefficient.split(".")[1]?.length ?? 0;
  const power = Number(exponent) - decimals;
  const numerator = BigInt(coefficient.replace(".", ""));
  return power < 0
    ? [numerator, 100n * 10n ** BigInt(-power)]
    : [numerator * 10n ** BigInt(power), 100n];
}

export function percentOf(amount: bigint, value: number): bigint {
  const [numerator, denominator] = percentage(value);
  return (amount * numerator) / denominator;
}

export function providerSplit(
  amount: bigint,
  metaPercent: number,
): [number, number] {
  const [numerator, denominator] = percentage(metaPercent);
  let meta = (amount * numerator) / denominator;
  // The complementary share's fractional remainder is denominator - remainder.
  const remainder = (amount * numerator) % denominator;
  if (remainder > 0n && remainder * 2n >= denominator) meta++;
  return [integer(meta), integer(amount - meta)];
}
