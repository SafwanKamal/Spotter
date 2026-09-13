# UI editing guide

Start here when changing Spotter's appearance. Preserve the route responsibilities and privacy decisions in `.codex/PROJECT_LEDGER.md`.

## The design language (read this first)

Spotter is **one product surface with one visual language**. Before adding
anything, find the existing pattern — a new recipe is almost always the wrong
answer, and it is how the app ended up with five card styles, three selects and
thirty-one font sizes.

**Type.** Sans (`--font-body`) for everything you can read as language:
headings, labels, body, buttons. Serif (`--font-display`) is the *numeral and
wordmark* face only — rep counts, angles, durations, leaderboard ranks, the
SPOTTER mark. A serif sentence is a bug.

**The scale.** Use the named steps, not the legacy pixel aliases:
`--text-2xs | xs | sm | base | md | lg | xl | 2xl` and `--display-1 | -2`.
The old `--text-14`-style names still resolve (each one snaps to the nearest
step) so untouched rules keep working, but new CSS should name the step it
means. Spacing snaps to a 4px grid; radii are `--radius-xs | sm | md | lg |
pill | circle`; elevation is `--shadow-1` (resting) or `--shadow-2` (raised).

**Page shell.** Every route is `.journal` / `.page-shell` / `.dashboard` /
`.profile-workspace` at `--page-max` with `--page-gutter`. A page that invents
its own width makes the title jump when you change tab. Focused pages use
`--page-max-narrow` *for their content column*, still starting at the shared
gutter.

**Page head.** `.page-head` — optional eyebrow, an `h1`, one supporting line,
and an optional actions slot on the right. Titles name the page ("Motion
replay", "Community", "Rewards"). They are not slogans; aphorisms belong on
`/welcome`, if anywhere.

**Surfaces.** Two, defined once in the SURFACES block of `globals.css`: the
white card (`.ui-card` and friends — hairline border, `--radius-lg`,
`--shadow-1`) and the tinted panel (`--sage`, no shadow) for supporting
information. The accent-filled `.cta-card` is the single exception, and there
is one of it. Add a selector to the existing group rather than writing another
background/radius/shadow trio.

**Controls.** `.button` variants for actions; `.segmented` for every
"pick one of a few" row (the activity period, upload/live, community sort);
`.ui-input` / `.ui-select` for fields — those classes now carry real rules, so
a page never needs to style a native select again.

**Interaction.** One model, defined in the INTERACTION block of
`globals.css`. Hover changes *tone* — background, border, colour — and never
position: nothing lifts, grows, or floats under the cursor. Pressing dims
(`opacity: .85`). Focus is a 2px `--focus-ring` outline at 2px offset, drawn
inside the box (`outline-offset: -2px`) for controls that sit in a track or a
tight row; fields show focus as a tightened border plus a `--focus-halo` ring
instead, so nothing detaches from the control. A pointer click never draws a
ring — only `:focus-visible` does. All of it transitions at 0.14s.

**Selects.** The `Select` primitive draws its own control: `appearance: none`,
a single inline chevron, the same 42px height and radius as `Input`. A page
should never style a native select again; if one looks wrong, fix the shared
rule.

**Colour.** `--ink` is the primary action and text colour; `--clay` /
`--accent-ink` is the accent for marks, emphasis and the one filled CTA;
`--sage` is the informational tint; `--muted` is secondary text. The page wash
is deliberately below the threshold where it shows up as a gradient.

## Where to edit

| Change                                                            | Source of truth                                                                                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colors, fonts, type scale, spacing scale, radii, shadows          | `src/styles/theme.css`                                                                                                                                |
| Shared button/link variants                                       | `src/components/ui/button.tsx`; `.button`, `.primary`, `.quiet`, `.outline`, `.sample-button`, `.link-button`, `.cta-button` in `src/app/globals.css` |
| Cards and linked cards                                            | `src/components/ui/card.tsx`; the corresponding profile/rewards/hero/CTA recipes in `src/app/globals.css`                                             |
| Inputs and selects                                                | `src/components/ui/field.tsx`. `Input` is a native input. `Select` is a custom listbox (native selects render their options with the OS, which ignores the theme) — it takes `value` + `onValueChange` and reads `<option>` children as data. Appearance: `.ui-input`, `.ui-select`, `.ui-select-list` in `src/app/globals.css` |
| Route labels, order, mobile visibility, icons and active matching | `src/lib/navigation.tsx`                                                                                                                              |
| Global header, footer and page wrapper                            | `src/components/site-shell.tsx`                                                                                                                       |
| Mobile navigation layout                                          | `src/components/mobile-tab-bar.tsx`; `.tab-bar*` in `src/app/globals.css`                                                                             |
| Community-specific layout and component recipes                   | `src/app/social/social.module.css` (consumes the same theme)                                                                                          |
| Route-specific layout and responsive behavior                     | `src/app/globals.css` and route workspace components                                                                                                  |

## Theme rules

`globals.css` imports `theme.css` once. The theme owns all literal UI colors, including dashboard, chart, SVG overlay and WebGL replay colors. Edit semantic roles such as `--ink`, `--card`, `--focus-ring`, `--pose-landmark` and `--replay-surface`. Dashboard roles are globally defined `--dashboard-*` tokens, not a separate local palette.

Typography uses `--font-body`, `--font-display`, `--font-mono` and `--text-*`. Spacing uses `--space-*`; radii use semantic sizes and scale aliases. The existing fine-grained sizes are retained to avoid a redesign during consolidation. `--space-unit`, `--type-scale` and `--radius-scale` offer global density/type/rounding controls; individual tokens can still be adjusted. Validate mobile layouts when changing them.

Layout geometry (chart dimensions, SVG coordinates, media aspect ratios, breakpoints and positioning) stays with the relevant layout. These values are not interchangeable with visual spacing tokens. Breakpoints remain literal CSS media queries because native custom properties cannot be used in media-query conditions.

SVG uses CSS variables directly. Three.js resolves the replay tokens from the viewer's computed style when a BVH viewer initializes. A running WebGL scene does not subscribe to live theme changes: reload its BVH or refresh after changing those tokens. No runtime theme switcher is implemented.

## Component rules

- Use `Button` for actions and `ButtonLink` for navigation. Variants: `primary`, `quiet`, `outline`, `default`, `sample`, `link`, `cta`. Keep native `type`, `disabled`, refs and ARIA attributes. `unstyled` is for specialized controls such as timeline items and Community voting; their contextual CSS still owns the recipe.
- Use `Card` (`as="section"`, `"article"` or `"div"`) and `CardLink`. Variants: `profile`, `rewards`, `hero`, `cta`, `custom`. `custom` supports scoped Community recipes. `.ui-card` is a global hook; recipe classes preserve the existing appearance.
- Use `Input` and `Select` with native labels and props. File and range inputs retain their native behavior and refs. These primitives add no wrapper DOM.
- Import primitives directly from their files. They need no new client boundary; client owners provide event handlers.
- Extend an existing variant or add a shared variant before copying a recipe into another page. Avoid new literal colors or local theme declarations.
- Desktop and mobile navigation share the five primary destinations. Overview becomes Today on mobile; Replay is included in the tab bar. Change those choices in the shared navigation configuration.

## Verification and handoff

Run `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`. The UI-system browser checks cover all six content routes at desktop/mobile sizes, accessibility, overflow and global token propagation into scoped Community styles and SVG overlays. Existing tests exercise profile persistence, analysis buttons/file refs, local voting, replay and nested rewards. The private real-clip test requires `SQUAT_CLIP`.

Review the generated `test-results/ui-*.png` screenshots when making visual changes. Summarize changed theme roles/components and validation in the project ledger. Keep route state, scoring and backend contracts separate from presentation changes.

Competition UI: `competition-provider.tsx` shares the fresh directory/chain snapshot; `competition-panel.tsx` owns the Community-only responsive rail; `competition-workspace.tsx` shows standings and prize distribution. Wallet code loads only on the detail route. Competition layout consumes existing tokens and Card/Button/Select primitives; directory and on-chain boundaries are documented in `docs/competitions.md`.
