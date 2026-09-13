# Gym competitions and Solana prize pools

The Community tab (`/social` and its nested routes) is the only place with the competition sidebar. Other tabs and competition detail pages use the full-width layout; competition polling runs only in Community and competition details. The left sidebar lists organizer-published competitions, newest directory update first. On screens up to 1100px it becomes a collapsible panel above the page. Details live at `/profile/competitions/[id]`. The shared feed refreshes every 30 seconds while visible and on tab focus. RPC failures are labeled; targets are never displayed as confirmed funding.

## What is live and what is demonstration data

- The gym directory and reviewed standings are local, operator-managed data in `.data/competitions.json` (or `COMPETITIONS_FILE`). No external gym discovery feed is connected.
- `npm run seed:competitions` creates three explicitly fictional competitions and private demo-athlete signer files in gitignored `.data/`. It preserves an existing directory. Never import these test keys into a real-value wallet.
- Solana balances, finalized wallet recipients and claim bits are fetched from confirmed devnet accounts. The browser never supplies the displayed funding balance.
- App participation points do not determine financial eligibility. Standings are explicitly reviewed metadata supplied by the organizer. There is no automatic entry ingestion, identity/anti-cheat service or public review API. To run a real event, the organizer must separately review submissions and publish their wallet addresses and accepted rep counts. Demo names and scores are not live athletes.
- The program is an upgradeable devnet prototype, not audited production escrow. Upgrade authority can change the code. Do not use real funds.

## Payout rules

One organizer commits a fixed pool of at most 1 devnet SOL. Its PDA commits to the organizer and a SHA-256 digest of published competition terms (including ID, dates, exercise, target, ranking policy and 50/30/20 split). Funding also pays rent. Updating terms creates a different pool address; never edit funded terms.

After the end timestamp, the organizer signs one finalization containing three distinct winner wallets plus a digest of the reviewed results. The interface selects the highest reviewed rep counts, breaking ties by ascending ASCII wallet address. The program trusts the organizer's selection; it does not evaluate reps, prevent multiple wallets per person, or inspect video. Names and rep counts are editable directory metadata, while wallet recipients and results digest are recorded on-chain.

Each winner signs a claim for their rank. First receives floor(pool × 50 / 100), second floor(pool × 30 / 100), third the remainder. This conserves all prize lamports. The program transfers funds and marks the claim in one atomic instruction. Repeat claims, wrong recipients, early finalization and unauthorized finalization fail. Anyone can independently inspect the pool account. The UI links it to Explorer.

Payout is **claim-based**, not a scheduled automatic transfer at closing. The user pays the claim network fee in the browser; the CLI rehearsal sponsors fees to make recipient deltas exact. There is no withdrawal, cancellation or refund instruction. Rent and unsolicited extra deposits stay in the account. An event with fewer than three reviewed wallets cannot finalize through the UI. Fund only a demo with known participants. Raw video, landmarks and AI coaching are not sent on-chain.

## Run and verify

1. `npm run seed:competitions`
2. Install official `cargo-build-sbf` (`cargo install cargo-build-sbf --locked`) and the Solana CLI. Run `npm run build:competition`.
3. `npm run test:competition-program` executes the compiled binary in LiteSVM, including adversarial cases and actual lamport changes.
4. Set `SOLANA_KEYPAIR_PATH` in `.env.local` to the existing devnet organizer key, and `SOLANA_RPC_URL` to a devnet RPC. Fund it with test SOL for deployment rent and prizes. Never put private keys in source or chat.
5. `RUN_SOLANA_DEVNET=1 npm run deploy:competition` deploys and writes the public `NEXT_PUBLIC_COMPETITION_PROGRAM_ID` to `.env.local`. Optional `SOLANA_CLI` selects a CLI path. The script retains a private buffer signer under `.data/` for resumption; `COMPETITION_BUFFER_ADDRESS` can resume an existing buffer. Failed CLI recovery output is withheld from logs. Restart Next if needed.
6. Connect the organizer wallet on a competition page to fund it. After its end, review the three wallets and finalize. A winner connects their wallet and claims their prize.
7. Alternatively `RUN_SOLANA_DEVNET=1 npm run demo:competition` funds the three seeded demos and settles the short lunge rehearsal with the saved demo signers. It only accepts fictional competitions owned by the configured organizer. Before initial funding it moves the lunge rehearsal close 45 seconds ahead; it never changes funded terms. Repeats read chain state and skip existing actions. New demo winner wallets receive separate account-initialization funding when needed; it is not deducted from prize allocations. Public transaction receipts are recorded in `.data/competition-demo-receipts.json`.

Tests: `npm test`, `npm run test:competition-program`, and `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/browser/competitions.spec.ts`. The program source is `programs/competition/src/lib.rs`; the binary codec/instructions are `src/lib/competition-chain.ts`. Build artifacts and the generated program keypair remain gitignored. Normal npm tests cover the pure policy; the SBF test requires a compiled binary.

## Publish directory updates

Edit the operator-controlled JSON file using the shape validated by `competitionSchema` in `src/lib/competitions.ts`. Each entry needs a unique ID, valid organizer and athlete Solana addresses, title, gym, exercise, start/end Unix seconds, decimal lamport target, `demo` label and `updatedAt` Unix seconds. Each athlete has `name`, `wallet`, integer `score`, and `reviewed`. Only reviewed rows are ranked. Update `updatedAt` when publishing results. Keep private user identity and evidence out of this public file.

For an external gym feed, replace the directory reader with an authenticated organizer integration while keeping schema validation and chain verification. Do not turn arbitrary browser summaries into approved results. A production version needs reviewed enrollment, locked result provenance, dispute/cancellation policy, audit and upgrade governance before real-value deployment.

Observed chain evidence and reproducible verification: [devnet verification](competition-devnet-verification.md).
