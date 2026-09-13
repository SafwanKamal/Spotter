## Canonical repository

The user owns https://github.com/SafwanKamal/Spotter.git. This is the canonical repository for all future work. Use it as `origin`; do not push to the former Mack-Kabir/HackWestx_26 and SafwanKamal/FormChain repositories. The local checkout remains `/Users/safwankamal/Documents/HackwestTX`.

## Project continuity

For material project work, use `maintain-project-ledger`, read `.codex/PROJECT_LEDGER.md`, and verify branch, commit, and worktree state before changes. Update the ledger with evidence and next steps before handoff.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Shared UI system

Before changing presentation, read `docs/ui-system.md`. Use `src/styles/theme.css` for colors, typography, spacing, radii, shadows and visualization colors; use the primitives in `src/components/ui/` for buttons, cards and form controls. Extend shared variants before duplicating a recipe. Keep desktop/mobile route metadata in `src/lib/navigation.tsx`. Preserve native semantics and route behavior, and verify affected desktop/mobile routes after theme changes.
