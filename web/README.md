# Release Desk frontend

One static React + TypeScript page for the deployed OTCBoard on Sepolia. Vite builds the supplied export in `../dist/`. Viem supplies public RPC reads, ABI encoding, simulation and injected-wallet signing. No backend, indexer, external font, API key, WalletConnect project or private RPC credential is required.

## Run and rebuild

Use Node 22.12+ and npm. Keep the repository's Git history: the export script reads ABIs from the deployed source commit.

```sh
cd web
npm ci --cache /tmp/desk-npm-cache --no-audit --no-fund
npm run build
npm run preview
```

Open the local URL printed by Vite preview. `base: './'` and document-relative runtime fetches support static gateways and subpaths without rewrites. `file://` is not supported because the browser must fetch the manifest and ABI JSON over HTTP(S). Production hosting uses HTTPS for browser wallets.

The production export is supplied alongside source; the publisher does not need to rebuild it. The worker could not create a Git commit because this workspace’s `.git` directory is read-only. `npm run build` typechecks, builds Vite, copies pinned ABI bytes, then writes `dist/imd-deployment.json` last. Do not edit exported files without regenerating that inventory. `npm run dev` serves source but the production preview is the supported integrated preview, since its deployment assets are generated in `dist/`.

Dependency installation may use the network as authorized. Once dependencies are installed, builds need no network; the lockfile pins all frontend packages. For a cached reinstall, use `npm ci --offline --cache /tmp/desk-npm-cache`. There is no vendored npm registry. The permitted `web/.gitignore` excludes dependency and cache directories at every nesting level.

## Configuration and integrity

`web/deployment/handoff.json` and `web/deployment/network.json` retain the supplied handoff as build inputs. `scripts/export.mjs`:

1. Reads `docs/abi/<Contract>.json` using `git show <deployed sourceCommit>:<path>`; requires byte equality with the working ABI export.
2. Checks canonical Keccak-256: recursively sort JSON object keys, preserve array order, encode compact JSON as UTF-8, hash, strip `0x`.
3. Copies the exact handoff identifiers and full contract set into the runtime manifest. Copies the complete `network` object and `walletAddChain` parameters unchanged.
4. Inventories every other file in `dist/` with SHA-256, rejecting oversized exports, symlinks and excessive asset counts.

The application only gets addresses, chain, RPC URLs and ABI paths from this runtime manifest. `src/config.ts` loads the referenced ABI arrays and rechecks their hashes. It then checks the configured RPC's chain ID, nonempty code at every attested address, and OTCBoard's featured-token binding. Failed checks disable transactions and offer a retry. These are binding and code-presence checks, not a claim that arbitrary tokens are safe or that deployed runtime code was independently audited.

The approved workflow is fixed-price OTC trading. Quotes call OTCBoard's `quote`; approvals authorize OTCBoard to escrow the selected token. There are no AMM swaps or liquidity controls in this assignment's workflow. The supplied Uniswap address block remains unchanged in the manifest and is not used by OTC transactions. No router, Permit2, quoter or chain address is hard-coded in the frontend source.

## Wallet and transaction behavior

Connect an injected Ethereum wallet, including a compatible wallet's in-app browser. The application uses the provider exposed at `window.ethereum`; multi-wallet discovery and WalletConnect are not implemented. No project ID was supplied. A wrong-network wallet gets one switch control. An unknown-chain failure (4902, including nested errors) triggers the exact supplied `wallet_addEthereumChain` request, followed by another switch.

- Browse DESK by default or load a valid ERC-20 address. Token decimals and symbol come from the chain; a missing symbol falls back to TOKEN. Posting supports 0–30 decimals.
- The board loads 12 orders at a time, newest first, with an explicit older-orders button. Filters apply to the displayed loaded range; the UI states that limitation. Reads use contract views only and a common block number, with bounded concurrency of six. Refresh runs every 20 seconds while the page is visible, and after transactions.
- Enter the amount and approve exactly that amount to OTCBoard, then post with an ETH price per whole token and a duration of 1, 7, 30 or 89 days. A separate reset-to-zero allowance action supports tokens requiring it. Posting escrows tokens and cannot edit an existing order.
- Choose an order, enter the amount using its stored decimals, and request the exact onchain quote. Input changes invalidate the quote. Buy sends that exact wei value. Immediately before signing, the app rereads the order and quote and checks maker, expiry and remaining amount.
- Makers can explicitly confirm cancellation before or after expiry. Withdrawal sends all available ETH credit to the connected wallet.
- Every write is simulated first. Wallet account and chain are checked before simulation and again before signing. A single pending write disables other transactions. Confirmations refresh state; reverts, rejections and transaction replacement are explained. Explorer links expose contract, account and last transaction details.

Fee-on-transfer tokens may escrow or deliver less than the entered quantity. Rebasing tokens are unsupported. Token names are not identity; verify the contract address. Gas is additional to the exact fill price. No transactions were broadcast during this assignment.

## Validation

```sh
cd web
npm run typecheck
npm test
npm run check:export
PLAYWRIGHT_BROWSERS_PATH="$PWD/node_modules/.cache/ms-playwright" npm exec -- playwright install chromium
npm run test:browser
node scripts/check-live.mjs
```

The browser test manages and closes its own foreground HTTP server and Chromium session, serves the actual production export at `/preview/`, and intercepts wallet/RPC requests. It does not depend on a preview daemon or a real wallet. Screenshots and results are written inside `docs/validation/`. The separate live check makes only `eth_chainId`, `eth_blockNumber`, `eth_getCode` and `eth_call` requests using the manifest's public RPC URLs, and records exact block-pinned calls.

See [validation](../docs/VALIDATION.md), [design](../docs/DESIGN.md), and [browser evidence](../docs/validation/browser-results.json). Root `DESIGN.md` was not created because the overriding write scope permits documentation only under `docs/` or `web/`.
