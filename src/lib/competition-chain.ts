import {
  AccountRole,
  address,
  getAddressEncoder,
  getAddressDecoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
export const POOL_SIZE = 211;
export const SPLITS = [50, 30, 20] as const;
export function awards(total: bigint): bigint[] {
  if (total < 0n) throw new Error("Invalid pool amount");
  const first = (total * 50n) / 100n,
    second = (total * 30n) / 100n;
  return [first, second, total - first - second];
}
export function sol(value: string | bigint) {
  return (Number(value) / 1e9).toLocaleString("en-US", {
    maximumFractionDigits: 9,
  });
}
export async function digestBytes(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}
export async function competitionAddress(
  program: Address,
  organizer: Address,
  digest: Uint8Array,
) {
  return (
    await getProgramDerivedAddress({
      programAddress: program,
      seeds: [
        new TextEncoder().encode("competition"),
        getAddressEncoder().encode(organizer),
        digest,
      ],
    })
  )[0];
}
export type PoolState = {
  organizer: string;
  digest: string;
  endsAt: number;
  funded: string;
  finalized: boolean;
  claimed: number;
  winners: string[];
  resultsDigest: string;
};
export function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function decodePool(data: Uint8Array): PoolState {
  if (
    data.length !== POOL_SIZE ||
    data[0] !== 1 ||
    data[81] > 1 ||
    data[82] > 7
  )
    throw new Error("Invalid competition account");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    organizer: getAddressDecoder().decode(data.slice(1, 33)),
    digest: hex(data.slice(33, 65)),
    endsAt: Number(view.getBigUint64(65, true)),
    funded: String(view.getBigUint64(73, true)),
    finalized: Boolean(data[81]),
    claimed: data[82],
    winners: [0, 1, 2].map((i) =>
      getAddressDecoder().decode(data.slice(83 + i * 32, 115 + i * 32)),
    ),
    resultsDigest: hex(data.slice(179, 211)),
  };
}
function instruction(
  program: Address,
  actor: TransactionSigner,
  pool: Address,
  data: Uint8Array,
  init = false,
): Instruction {
  const actorMeta = {
    address: actor.address,
    role: AccountRole.WRITABLE_SIGNER,
    signer: actor,
  };
  return {
    programAddress: program,
    accounts: [
      actorMeta,
      { address: pool, role: AccountRole.WRITABLE },
      ...(init
        ? [
            {
              address: address("11111111111111111111111111111111"),
              role: AccountRole.READONLY,
            },
          ]
        : []),
    ],
    data,
  };
}
export function fundInstruction(
  program: Address,
  actor: TransactionSigner,
  pool: Address,
  digest: Uint8Array,
  endsAt: number,
  amount: bigint,
) {
  if (
    digest.length !== 32 ||
    !Number.isSafeInteger(endsAt) ||
    amount <= 0n ||
    amount > 1_000_000_000n
  )
    throw new Error("Invalid competition funding");
  const data = new Uint8Array(49);
  data.set(digest, 1);
  const view = new DataView(data.buffer);
  view.setBigUint64(33, BigInt(endsAt), true);
  view.setBigUint64(41, amount, true);
  return instruction(program, actor, pool, data, true);
}
export function finalizeInstruction(
  program: Address,
  actor: TransactionSigner,
  pool: Address,
  winners: string[],
  results: Uint8Array,
) {
  if (
    winners.length !== 3 ||
    new Set(winners).size !== 3 ||
    results.length !== 32
  )
    throw new Error("Three distinct reviewed winners are required");
  const data = new Uint8Array(129);
  data[0] = 1;
  winners.forEach((w, i) =>
    data.set(getAddressEncoder().encode(address(w)), 1 + i * 32),
  );
  data.set(results, 97);
  return instruction(program, actor, pool, data);
}
export function claimInstruction(
  program: Address,
  actor: TransactionSigner,
  pool: Address,
  rank: number,
) {
  if (!Number.isInteger(rank) || rank < 0 || rank > 2)
    throw new Error("Invalid prize rank");
  return instruction(program, actor, pool, new Uint8Array([2, rank]));
}
