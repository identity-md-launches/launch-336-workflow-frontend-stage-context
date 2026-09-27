import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import { keccak256, toHex } from 'viem';
const root = fileURLToPath(new URL('../../', import.meta.url));
const handoff = JSON.parse(await readFile(new URL('../deployment/handoff.json', import.meta.url)));
const { network, walletAddChain } = JSON.parse(await readFile(new URL('../deployment/network.json', import.meta.url)));
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value);
if (network.chainId !== handoff.chainId || Number(walletAddChain.chainId) !== handoff.chainId) throw Error('Chain mismatch');
const out = resolve(root, 'dist');
await mkdir(resolve(out, 'abi'), { recursive: true });
const contracts = [];
for (const { name, address, abiHash } of handoff.contracts) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw Error('Invalid contract name');
  const source = execFileSync('git', ['show', `${handoff.sourceCommit}:docs/abi/${name}.json`], { cwd: root });
  const abi = JSON.parse(source);
  if (!Array.isArray(abi) || keccak256(toHex(canonical(abi))).slice(2) !== abiHash) throw Error(`ABI hash mismatch: ${name}`);
  const current = await readFile(resolve(root, `docs/abi/${name}.json`));
  if (!current.equals(source)) throw Error(`Working ABI differs from pinned commit: ${name}`);
  const abiPath = `abi/${name}.json`;
  await writeFile(resolve(out, abiPath), source);
  contracts.push({ name, address, abiHash, abiPath });
}
const assets = [];
let bytes = 0;
async function walk(dir) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const full = resolve(dir, entry.name), path = relative(out, full);
    if (entry.isSymbolicLink()) throw Error('No symlinks in export');
    if (entry.isDirectory()) await walk(full);
    else if (path !== 'imd-deployment.json') {
      const data = await readFile(full);
      if ((await stat(full)).size > 8388608) throw Error('Asset exceeds 8 MiB');
      bytes += data.length;
      assets.push({ path, sha256: createHash('sha256').update(data).digest('hex') });
    }
  }
}
await walk(out);
if (assets.length > 128 || bytes > 8 * 1024 * 1024) throw Error('Export exceeds task budget');
const { launchId, chainId, sourceCommit, attestationHash } = handoff;
await writeFile(resolve(out, 'imd-deployment.json'), JSON.stringify({ version: 1, launchId, chainId, sourceCommit, attestationHash, contracts, assets, network, walletAddChain }, null, 2) + '\n');
console.log(`Verified ${contracts.length} pinned ABIs; inventoried ${assets.length} assets, ${bytes} bytes.`);
