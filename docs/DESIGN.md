# Release Desk design

## Overview

Release Desk is a compact, one-page fixed-price market for people trading testnet tokens for ETH. A warm paper background, dark ink, restrained rust actions and a serif heading distinguish the product. The main order book precedes the posting and settlement panels in document order. State is presented as text, not just color. These are implemented choices, not user-specified branding.

Source of truth: `web/src/styles.css`, with markup and patterns in `web/src/App.tsx`. The design record lives here because the task's overriding path budget excludes repository-root `DESIGN.md`.

## Colors

The source uses a small sRGB hex palette with semantic variables referencing primitives. No theme switch or dark palette is implemented.

| Semantic token | Value | Role |
| --- | --- | --- |
| `--bg` | `#f4f3ec` | Page background |
| `--surface` | `#fffef9` | Posting card and input surfaces |
| `--surface-muted` | `#e9e8df` | Proceeds, expanded order and disabled actions |
| `--text`, `--focus` | `#252b24` | Primary text and 3px focus perimeter |
| `--muted` | `#61665b` | Supporting copy, labels and hints |
| `--border` | `#b5b6aa` | Noninteractive structural separators |
| `--control-border` | `#85887c` | Interactive control boundaries |
| `--accent` / `--accent-hover` | `#ad3e24` / `#90321d` | Primary action background |
| `--on-accent` | `#fffef9` | Primary action text |
| `--success` / `--success-bg` | `#356047` / `#e8eee6` | Open-order labels and checked status |
| `--error` / `--error-bg` | `#972e32` / `#fff0eb` | Recoverable error messages |

Measured rendered pairs: primary text/page 13.02:1; muted/page 5.30:1; open-order text/surface 6.11:1; active primary action 5.96:1; input border/inner surface 3.58:1, border/outer page 3.25:1. These measurements concern the identified pairs, not every possible state. See `VALIDATION.md` for coverage.

## Typography

Use the platform fonts: Arial, Helvetica, sans-serif for UI; Georgia, Times New Roman, serif for the main heading and numbered explainer. Address input uses `ui-monospace, SFMono-Regular, Consolas, monospace`. There are no downloaded fonts; actual font substitutions depend on the host OS.

Body is 16px with 1.5 unitless line height. Semantic sizes are `--text-small` 13px, `--text-label` 14px, `--text-body` 16px and `--text-heading` 24px. Supporting metadata ranges from 11–12px; labels and actions use 600 weight, eyebrows 700. The wordmark requests 800. Native font fallback/synthesis remains enabled.

The h1 uses Georgia 400, `clamp(2.5rem, 5.1vw, 4.5rem)`, 1.04 line height and −0.045em spacing. It changes to 3.15rem below 38rem and 2.7rem below 22rem. Section h2 headings use 1.5rem/1.2 and −0.04em. Proceeds h2 uses 1.125rem. Smaller h3 headings are 1.1rem. Headings balance their wrapping; descriptions use pretty wrapping. Numbers are tabular. Exact amounts remain selectable and wrap instead of rounding away meaningful precision. Form inputs remain 16px on narrow layouts.

## Layout

`.wrap` caps total width at 1272px, initially with 40px inline padding. `.workspace` uses `minmax(0, 1fr) 350px` columns and a 40px gap. The page uses ordinary flow, without fixed or sticky bars. Field groups have 20px separation, paired controls 12px, card interiors 26px.

- At 65rem: 28px page insets, 26px workspace gap, 320px sidebar and 22px panel padding.
- At 53rem: one main column; posting and proceeds panels sit side by side below the book.
- At 38rem: 20px page insets, stacked sidebar, intro and disclosures; input/action groups wrap into full-width controls. Explainer items become compact rows.
- At 22rem: 16px page insets, stacked order summary and 20px panel padding.

The book explicitly labels its loaded range. Order details expand in place; they do not open a modal. Long addresses are fully available in deployment disclosure/explorer links, with wrapping. The editable address field can scroll horizontally inside its control. Observed widths: 1440, 900, 768, 390 and 320 CSS pixels. Text enlargement was checked separately from native browser zoom.

## Elevation & Depth

The interface is flat. Surface changes group posting, proceeds and order details. Borders separate orders and establish control boundaries. The selected filter uses an inset 2px shadow as an underline, not elevation. The skip link alone uses `z-index: 2`; no overlay stack exists.

## Shapes

Panels have 10px radii, empty state 8px, expanded order 7px, buttons 6px, inputs/selects 5px, counts 4px, and status labels 3px. Circular dots and step numbers are secondary cues accompanied by text. Arrow characters are decorative and hidden from assistive technology where they occur inside action labels.

## Components

- `Desk` in `App.tsx` owns wallet, network, verification, read and transaction states. `.status-strip`, persistent polite `.transaction-status`, and alert `.error-box` keep updates visible.
- `AddressLink` builds an explorer link with a full accessible address and optional visible label. Full values are exposed in the native deployment disclosure.
- `PostForm` uses labeled native inputs, select and fieldset. Validation focuses the first invalid field and associates its error via `aria-describedby`. Approval and posting are separate controls. `.primary` emphasizes connection when disconnected, then posting once approved. Secondary actions remain outlined or `.quiet`.
- `OrderRow` presents order identity, maker, remaining tokens and price. Its native button announces expanded state. Quote input changes invalidate the displayed quote. Maker cancellation has an explicit confirmation step. Quote, simulation, signing and prerequisite gates prevent unavailable writes.
- `.proceeds` shows the whole withdrawable ETH balance and disables withdrawal at zero or while disconnected.
- Native `details`/`summary` disclose trading notes and deployment data. `.empty` explains what to do next; pagination exposes older orders.

Buttons have a minimum 44px height; hover effects are limited to hover-capable devices. `:focus-visible` uses a 3px perimeter with a 4px offset, with `Highlight` in forced colors. A skip link targets the main landmark. There are no animations, transitions, autoplay, modals or drag interactions.

## Do's and Don'ts

Reuse semantic tokens and the existing `.field`, `.hint`, `.error-box`, `.input-action` and button patterns. Keep exact numeric values and token-specific units. Add new content in the main flow, with an actual heading and native controls; test both columns and the narrow stack. Use one filled primary action for the current task. Preserve the visible prerequisite explanation beside disabled actions.

Do not turn separators into control borders, communicate status solely by hue, truncate an amount, or hide transaction errors in a timed toast. Do not introduce a second deployment/address map in a new component.

Design guidance applied from Jakub Krehel's Better Interface, MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Documentation method adapted from Paul Bakaus's Impeccable, Apache-2.0, pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`, [document reference](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md). The supplied pinned guide was read locally; no replacement design guide was fetched.
