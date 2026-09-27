# Frontend validation — Release Desk

Worker validation completed on 2026-09-27. These are worker observations, not an independent certification or the control plane's publication checks.

## Scope and decisions

Implemented the approved OTC workflow as one React/TypeScript/Vite page: live order book, DESK or arbitrary token filtering, exact approval then posting, exact quoted ETH fills, own-order cancellation, proceeds withdrawal, wallet/network handling and transaction observability. Public views supply listings without an indexer. No AMM swap or liquidity feature was specified by the approved OTC workflow; its quotes and allowances necessarily target OTCBoard. The entire provided Uniswap configuration is retained unchanged for the deployment manifest.

Only `web/`, `dist/` and `docs/` are delivered. `web/.gitignore` uses its explicit path allowance. Contract source, ABIs under `docs/abi/`, Foundry/root configuration, libraries and workflow inputs were preserved. The root design-document location conflicts with the overriding write scope; the complete design record is `docs/DESIGN.md`.

## Commands and results

| Command | Result |
| --- | --- |
| `npm install --prefix web --cache /tmp/desk-npm-cache --no-audit --no-fund` | Installed and pinned frontend dependencies; lockfile supplied |
| `npm ci --prefix web --offline --cache /tmp/desk-npm-cache --no-audit --no-fund` | Passed from the lockfile/cache with network disabled by npm; subsequent rebuild produced a byte-identical deployment manifest and asset hashes |
| `npm --prefix web run build` | Passed after final source corrections; includes `tsc --noEmit`, Vite production export and final manifest generation |
| `npm --prefix web test` | 5 tests passed: strict precision, expiry/maker eligibility, 4902 addition, rejected switching and pinned ABI hashing |
| `npm --prefix web run test:browser` | 25 recorded checks passed against production files served at `/preview/`; screenshots and structured results retained |
| `npm --prefix web run check:export` | Exact handoff/network match; 2 pinned ABI hashes and all 6 exported asset hashes verified; relative asset base checked |
| `node web/scripts/check-live.mjs` | Public Sepolia read-only validation passed; exact requests/results in `validation/live-read.json` |

The final export contains 502,677 asset bytes excluding its small manifest, well below the per-file, asset-count and HTTP budget limits. The manifest is written after the final build and excludes itself. Source/export measurements and the projected full-history bundle size are recorded in `validation/submission.json`. The actual repository’s `.git` is read-only; staging and committing failed. The size check uses a disposable scratch clone and does not modify protected repository metadata.

The supplied MCP browser failed at startup with `Transport closed`; its managed preview file was unavailable. Validation therefore used locally installed Playwright Chromium 140.0.7339.186, with a foreground script that creates and closes its own server/browser. This tested the actual final Vite output, not a component mock or development server.

## Browser and interaction evidence

`validation/browser-results.json` records each result, exact mocked transaction arguments, measured computed-color pairs, and screenshot paths. No page exceptions or resource failures occurred. An axe scan of the connected desktop state found zero WCAG A/AA rule violations (27 passing rules). This is not a full accessibility certification.

Mocked interactions exercise disconnected reads; missing wallet; connection rejection; wrong chain and exact add-chain parameters; invalid amount/price/address and focus recovery; exact ERC-20 allowance to the board; posting; quote invalidation; partial fill with exact `msg.value`; six-decimal one-base-unit fill with one wei payment; simulation revert with decoded reason before wallet submission; rejected signing; expired maker cancellation with keep/confirm choices; withdrawal and zero-credit disabling; account change; RPC read failure/retry; honest pagination through an empty filtered range; zero-order state; missing deployed code; and tampered ABI rejection. Simulations and calls are intercepted, so these results cannot demonstrate live wallet compatibility or live transaction success.

Responsive screenshots/checks cover 1440, 900, 768, 390 and 320 CSS pixels, with no horizontal overflow. Text enlarged to 200% at 768px also reflowed without overflow. Screenshots inspected include desktop disconnected, keyboard approval focus, empty board, and narrow/intermediate layouts. Keyboard checks cover skip-to-main, field error focus, tabbing from price through duration to approval, and Enter activation. They are partial keyboard coverage, not a complete screen-reader walkthrough.

## Better Interface consolidated review

All six domains' core principles and the workflow/documentation sections of the supplied pinned guide were read and applied during construction.

| Domain | Coverage and evidence | Limitations |
| --- | --- | --- |
| Accessibility — Checked | Native controls, associated labels/errors, one h1/main, skip link, visible focused approval screenshot, minimum 44px buttons, disabled prerequisites, alert/status semantics, axe scan | No screen reader, physical touch device, forced-colors rendering or complete keyboard-only end-to-end session |
| Layout — Checked | Shared edges, explicit pagination, book-first DOM, five rendered widths, 320px reflow, 200% text enlargement, long addresses available | Native browser 200% zoom and RTL/localization not tested; UI is English |
| Writing — Checked | Verb-led actions, separate approve/post, exact ETH/wei units, token caveats, recoverable wallet/RPC/revert messages, empty-state next action | Real wallet extensions may provide different error wording |
| Typography — Checked | Serif/sans hierarchy, natural wrapping, exact tabular numbers, 16px narrow inputs, selectable addresses/amounts | Host OS fallback fonts and other browser font engines untested |
| Colors — Checked | Semantic palette; computed rendered text pairs measured; control border strengthened; text labels accompany status colors | Dark theme not applicable; contrast coverage is for identified pairs, not every hover/error/forced-color state |
| UI — Checked | Flat surfaces, loading/disabled/open/empty/error/confirmation patterns, disclosure affordances, reviewed final screenshots | No motion/theme/modal subsystem, so animation/theme/dialog checks not applicable |

### Findings, corrections and rechecks

| Severity / source | Evidence and impact | Fix and recheck |
| --- | --- | --- |
| Medium — `web/src/core.ts:39` | Mock `OrderExpired` simulation initially displayed only “fill reverted”, hiding the recovery reason | Traverse decoded causes, map contract errors to action-oriented guidance, retain error name. Browser assertion now sees `OrderExpired` and proves no transaction submission |
| Medium — `web/src/styles.css:1` and `:51` | Initial control boundary `#b5b6aa` against `#fffef9` calculated at 2.03:1, below the 3:1 control-boundary target | Separate `--control-border: #85887c`; rendered input pair measured at 3.58:1 internally and 3.25:1 against page. Structural separators retain their quieter token |
| Low — `web/src/App.tsx:122` | 320px screenshot joined sentences where line breaks were hidden | Preserve literal spaces at breaks; final narrow screenshot shows separated sentences |
| Low — `web/src/styles.css:87` | Narrow section action wrapped its arrow onto an isolated line | Keep the action label together and size it for the row; rechecked at 320 and 390px with no overflow |
| Medium — `web/src/chain.ts:64` | Source review found a replacement receipt could have been reported as the original action's success | Only gas repricing preserves normal success; cancellation/other replacement reports a distinct outcome with explorer guidance. Typechecked; a replacement transaction was not exercised onchain or in the browser fixture |

No unresolved observed defect blocks the implemented OTC flows. Primary text/page measured 13.02:1, muted/page 5.30:1, open-state pair 6.11:1, active filled button 5.96:1. The border finding's original ratio was calculated from the actual pre-fix tokens; final text/control measurements use computed browser colors.

## Live read boundary and remaining limitations

The configured first public RPC returned chain ID 11155111 and nonempty code for both attested contracts. At pinned block `0xb3ec8c`, the token returned Desk / DESK / 18 decimals / 1,000,000,000 total tokens; `featuredToken()` matched the handoff and `orderCount()` returned 0. `validation/live-read.json` includes UTC time, URL, code lengths/digests and exact block-pinned `eth_call` recipes. These reads use curl; the browser integration uses intercepted RPC traffic, so real-browser RPC CORS and provider behavior remain unverified.

No wallet was funded, no transaction was signed or broadcast, and no deployment, source publication, IPFS pinning or site naming occurred. Live approval/post/fill/cancel/withdraw, fee-on-transfer and adversarial tokens, reorgs, delayed/replaced receipts, wallet-brand compatibility, Safari/Firefox and physical devices remain untested. Arbitrary ERC-20 behavior can still revert despite a successful earlier quote. A receipt timeout retains the explorer link and asks the visitor to check before retrying; pending state is not persisted across reloads.

Implementation and local validation are complete, with the documented design-path substitution. The requested Git commit is blocked by the read-only `.git` directory (`git add` could not create `.git/index.lock`). Source, export, lockfile and evidence remain in the permitted workspace paths for collection. Publication and independent service checks remain the publisher/control plane's responsibility.
