import assert from 'node:assert/strict';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { keccak256, toHex } from 'viem';
const base = new URL('../../', import.meta.url);
const read = p => readFile(new URL(p, base));
const m = JSON.parse(await read('dist/imd-deployment.json'));
const handoff = JSON.parse(await read('web/deployment/handoff.json'));
const network = JSON.parse(await read('web/deployment/network.json'));
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value);
assert.equal(m.version, 1);
for (const k of ['launchId','chainId','sourceCommit','attestationHash']) assert.equal(m[k], handoff[k]);
assert.deepEqual(m.network, network.network); assert.deepEqual(m.walletAddChain, network.walletAddChain);
assert.deepEqual(m.contracts.map(({name,address,abiHash}) => ({name,address,abiHash})), handoff.contracts.map(({name,address,abiHash}) => ({name,address,abiHash})));
for (const c of m.contracts) {
  const bytes = await read(`dist/${c.abiPath}`);
  const pinned = execFileSync('git', ['show', `${m.sourceCommit}:docs/abi/${c.name}.json`]);
  assert.deepEqual(bytes, pinned);
  assert.equal(keccak256(toHex(canonical(JSON.parse(bytes)))).slice(2), c.abiHash);
}
const actual = [];
async function walk(path) {
  for (const entry of await readdir(new URL(path, base), { withFileTypes: true })) {
    const next = `${path}/${entry.name}`;
    assert(!entry.isSymbolicLink());
    if (entry.isDirectory()) await walk(next); else if (next !== 'dist/imd-deployment.json') actual.push(next.slice(5));
  }
}
await walk('dist');
assert.deepEqual(actual.sort(), m.assets.map(a => a.path).sort());
assert(m.assets.length <= 128); let total = 0;
for (const asset of m.assets) {
  assert(!asset.path.startsWith('/') && !asset.path.split('/').includes('..'));
  const bytes = await read(`dist/${asset.path}`); total += bytes.length;
  assert(bytes.length <= 8388608); assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
}
assert(total < 8 * 1024 * 1024);
const html = (await read('dist/index.html')).toString(); assert(html.includes('./assets/'));
console.log(`PASS: exact handoff, unchanged network, ${m.contracts.length} pinned ABI hashes, ${m.assets.length} asset hashes, relative base; ${total} bytes.`);
