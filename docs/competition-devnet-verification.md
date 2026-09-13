# Competition devnet verification — September 13, 2026

Observed on public Solana devnet during implementation. These are fictional demonstration gyms and athletes; all amounts are test SOL. The chain transactions are actual finalized transactions, not simulated balances.

Program: [2Ti4CixeVPHq7Weu3ihRP9auAvAEjy9ZhzNTh9U4ntbd](https://explorer.solana.com/address/2Ti4CixeVPHq7Weu3ihRP9auAvAEjy9ZhzNTh9U4ntbd?cluster=devnet).

The deployed program bytes were read back and exactly matched the LiteSVM-tested SBF binary. SHA-256: `5a39065acaf29e6781fdf8626a012eefeb8eeee8bb64e42a840d3d74468ba3f6`.

| Competition | Funded prize pool | Verified state |
| --- | ---: | --- |
| West Texas Squat Open | 0.01 SOL | Funded; results not finalized |
| Weekend Push-up Cup | 0.02 SOL | Funded; results not finalized |
| Community Lunge Final | 0.001 SOL | Finalized; all three prizes claimed |

Total funded: 0.031 test SOL. Prizes paid: 0.001 test SOL. Remaining prize allocations: 0.03 test SOL. Account rent and network fees are additional and excluded from these totals.

The lunge demo transferred exactly 500,000 / 300,000 / 200,000 lamports to the first, second and third athlete wallets. Sponsor-funded wallet initialization was separate from prizes; the script paid claim fees from the organizer so observed recipient deltas equal the prize amounts. A public RPC rate limit interrupted the initial run; rerunning checked claim bits and resumed only the remaining payout.

## Finalized transaction receipts

- west-texas-squat-open:fund: [Explorer receipt](https://explorer.solana.com/tx/NrcsdqpZY2LjaEtGaKxXmAWSDYSntytkHmLyjExFbpqioxtbWQ2zXLHJGLvNrqfAt432Mzps3d83pjzfLtyykPg?cluster=devnet)
- weekend-pushup-cup:fund: [Explorer receipt](https://explorer.solana.com/tx/3EEEj4M7yG2pLMTxoEjhu3NcSPFChnqYesUVP4dW9jVY6YAsUttYYHYwFgKMBj1xDs5rMHke8j1BLQmFg2YMR1q5?cluster=devnet)
- community-lunge-finish:fund: [Explorer receipt](https://explorer.solana.com/tx/f6zuhV5LYecDA1TSL5yBC4wHn5GwQnE8wvcLMwHN4VCqMwjcWjYqxJTjqzoDpLHdARdH6BovmxxZfv2ECN6VaL6?cluster=devnet)
- community-lunge-finish:finalize: [Explorer receipt](https://explorer.solana.com/tx/2UU3pCi8csQE94ecBCpsK4VRmbgdZRBJ2EiAwmY3YoDdGczGpajjTQoQCpGW2XSHAnwMtHpDJDYMecfgBgtpLYAX?cluster=devnet)
- community-lunge-finish:claim-1: [Explorer receipt](https://explorer.solana.com/tx/BQGveojgMTB9yW4yEgPbwBEPcK7evmU27fLR4QFayowhEUKETrELK92RhVThJ9VGeMEQ7DWxk32U765j4EwswsJ?cluster=devnet)
- community-lunge-finish:claim-2: [Explorer receipt](https://explorer.solana.com/tx/5DrwSXMKrCmBWSoXLzDBbeLWF8n65n1yK9t2iB6hfUggMwLiVXSVUPhHSXWqRyPpvDC6SwxkHbyvkEcyU9AYvWCT?cluster=devnet)
- community-lunge-finish:claim-3: [Explorer receipt](https://explorer.solana.com/tx/3Q1qYYhDmoeNFbaU6HSMsXsbNhwz8mPqoCsaCGsPxj3AEvLT3w9NsNdoCpT1V5SWmHWv36JASFVRyLjoSdSoeqoP?cluster=devnet)

## Reproduce the checks

`npm run test:competition-program` tests the compiled program in LiteSVM: actual pool allocation, premature/unauthorized finalization rejection, locked winner list, wrong-recipient and duplicate-claim rejection, exact rounding, rent preservation and insufficient-fund atomic rollback.

`npx tsx scripts/verify-competition-receipts.ts` independently checks deployed byte equality and successful finalized receipt statuses without sending transactions.

`RUN_COMPETITION_DEVNET_UI=1 PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/browser/competition-devnet.spec.ts` checks live pool/claimed UI and results digest at desktop/mobile widths. It is opt-in because it needs the local published directory and funded demo. Default competition UI tests use deterministic fixtures without RPC or local secrets.

The browser wallet extension approval path has not been manually exercised with a human wallet. Devnet funding, finalization and claims were executed using the same instruction builders through CLI-held demo signers. The program remains upgradeable and unaudited; no production escrow or real gym verification is claimed.
