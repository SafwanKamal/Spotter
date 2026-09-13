# Design audit — September 2026

Why the app read as "assembled by a machine," and what changed.

## What was actually wrong

The complaint was that Overview looked coherent and everything else did not.
That is measurable, and the measurements were worse than the impression.

| | Before | After |
| --- | --- | --- |
| Distinct rendered font sizes | 31 | 10 (+1 clamp) |
| Distinct spacing values | 40 | a 4px grid |
| Distinct corner radii | 14 spellings | 5 |
| Elevation levels | 5 shadows | 2 |
| Page container widths | 5 (1440 / 1320 / 1200 / 1040 / 720) | 1 (+ a narrow measure) |
| Card treatments | 5 | 2 (+1 accent) |
| Native select styles | 3 bespoke | 1 shared |
| "Pick one of a few" controls | 4 patterns | 1 |
| Rules on `.ui-card` / `.ui-input` / `.ui-select` | **none** | the real definitions |

### 1. Two design languages in one product

Overview and Profile were built in the "Studio Light" dashboard idiom: sans
headings, compact cards, segmented controls, `--dashboard-*` tokens. Analyze,
Replay and Community were built in an editorial "journal" idiom: 58px serif
headlines, aphorism titles, tinted panels, generous whitespace. Welcome and
Sign-in were a third thing again. Nothing was wrong with either idiom; having
both, with no rule about which applied where, is what made the product feel
generated rather than designed.

### 2. A token system that encoded no decisions

`theme.css` defined a token for nearly every integer — `--text-10` through
`--text-88`, `--space-2` through `--space-96`. A scale whose steps are "every
number" is not a scale, and the result was 31 font sizes where a design system
needs about eight. Two tokens used in `welcome.module.css` (`--text-21`,
`--radius-9`) were never defined at all.

### 3. Primitives that were decorative

`Card`, `Input` and `Select` rendered `.ui-card`, `.ui-input` and `.ui-select`
— class names with **zero CSS rules behind them**. Every actual appearance came
from a page-specific recipe, which is why three pages each grew their own
`<select>` styling and five places each defined "what a card looks like."

### 4. Voice

Page titles were slogans: "Study the movement in three dimensions.", "Learn
from the lift, not the hype.", "Give your movement a second look." Section
headings restated the obvious ("Your recording is the starting point."). This
is the most recognisable AI-writing tell, and it was doing the work that a
plain noun would do better.

## The system now

Decided direction: **the product language is the dashboard idiom; serif is the
numeral face.** Full rules in `docs/ui-system.md`. In short:

- **Type** — sans for anything you read as language; serif (`--font-display`)
  only for numerals and the wordmark. Named steps `--text-2xs … --text-2xl`
  plus `--display-1/2`. Legacy `--text-<px>` names still resolve, each snapped
  to the nearest step, so old rules keep working and two rules asking for
  "about 14px" now get the same 14px.
- **Space** — every legacy token snaps to a 4px grid.
- **Surfaces** — one white card (hairline border, `--radius-lg`, `--shadow-1`)
  and one tinted panel (`--sage`), both defined once as a selector group in
  `globals.css`. `.cta-card` is the single accent-filled surface.
- **Shell** — one container (`--page-max`, `--page-gutter`) for every route, so
  a page title never moves when you change tab. Focused pages keep a narrow
  measure but start at the same left edge.
- **Page head** — `.page-head`: title, one supporting line, optional actions.
  Titles are names, not slogans.
- **Controls** — `.button` variants, one `.segmented` control, one field style
  behind `.ui-input` / `.ui-select`.

## Known gaps

- `npm test` cannot run from the Linux side of this workspace: `node_modules`
  holds the macOS esbuild binary. Run it on the Mac. `tsc --noEmit` and
  `eslint` are clean.
- The Playwright UI-system specs were not re-run; their screenshots in
  `test-results/` are pre-redesign.
- `.task-grid` / `.task-card` / `.how-section` are legacy recipes with no
  current markup. They now follow the shared surface rules, but they are dead
  code and should be deleted once confirmed unused.
