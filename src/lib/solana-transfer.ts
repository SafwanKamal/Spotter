export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export function parseSolAmount(value: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,9})?$/.test(value))
    throw new Error("Enter a SOL amount with up to 9 decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const amount =
    BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
  if (amount <= 0n || amount > 1_000_000_000n)
    throw new Error(
      "Choose an amount greater than zero and at most 1 devnet SOL.",
    );
  return amount;
}
