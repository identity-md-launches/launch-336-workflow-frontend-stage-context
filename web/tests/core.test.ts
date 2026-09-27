import test from 'node:test';
import assert from 'node:assert/strict';
import { amount, canFill, canCancel, stateOf, switchChain, describeError, type Order } from '../src/core.ts';
import { abiHash, canonical, localPath } from '../src/integrity.ts';
import { readFileSync } from 'node:fs';
const maker = '0x1111111111111111111111111111111111111111';
const taker = '0x2222222222222222222222222222222222222222';
const order: Order = { id: 1n, maker, token: maker, decimals: 6, cancelled: false, amount: 20n, remaining: 10n, pricePerToken: 1n, expiry: 100n };
test('strict amount parsing preserves precision and rejects silent rounding', () => {
  assert.equal(amount('0.000001', 6), 1n);
  assert.equal(amount('0.000000000000000001', 18), 1n);
  assert.equal(amount('12345678901234567890.123456', 6), 12345678901234567890123456n);
  for (const n of ['0','-1','1e4','0.0000001','1,000','NaN','Infinity','1.','']) assert.throws(() => amount(n, 6));
  assert.throws(() => amount('9'.repeat(80), 18));
});
test('eligibility uses stored decimals, exact expiry boundary and maker identity', () => {
  assert(canFill(order, taker, 99n)); assert(!canFill(order, maker, 99n)); assert(!canFill(order, undefined, 99n));
  assert(!canFill(order, taker, 100n)); assert.equal(stateOf(order, 100n), 'Expired');
  assert(canCancel(order, maker)); assert(canCancel({ ...order, expiry: 1n }, maker));
  assert(!canCancel(order, taker)); assert(!canCancel({ ...order, cancelled: true }, maker));
  assert(!canFill({ ...order, remaining: 0n }, taker, 1n));
});
test('4902 adds the exact configured chain then retries switching', async () => {
  const calls: unknown[] = []; let switches = 0;
  const add = { chainId: '0x123', chainName: 'Configured chain' };
  await switchChain({ request: async request => { calls.push(request); if (request.method === 'wallet_switchEthereumChain' && switches++ === 0) throw { code: 4902 }; } }, 291, add);
  assert.deepEqual(calls, [{ method: 'wallet_switchEthereumChain', params: [{chainId:'0x123'}] }, { method: 'wallet_addEthereumChain', params: [add] }, { method: 'wallet_switchEthereumChain', params: [{chainId:'0x123'}] }]);
});
test('wallet rejection never prompts chain addition', async () => {
  let calls = 0;
  await assert.rejects(switchChain({ request: async () => { calls++; throw { code: 4001 }; } }, 1, {}));
  assert.equal(calls, 1); assert.match(describeError({code:4001}), /rejected/);
});
test('canonical ABI hashes bind the pinned implementation exports', () => {
  const handoff = JSON.parse(readFileSync(new URL('../deployment/handoff.json', import.meta.url), 'utf8'));
  for (const c of handoff.contracts) {
    const abi = JSON.parse(readFileSync(new URL(`../../docs/abi/${c.name}.json`, import.meta.url), 'utf8'));
    assert.equal(abiHash(abi), c.abiHash); assert.notEqual(abiHash(abi.slice(1)), c.abiHash);
  }
  assert.equal(canonical({ z: [{ b: 2, a: 1 }], a: true }), '{"a":true,"z":[{"a":1,"b":2}]}');
  for (const p of ['../secret','/abi/X.json','https://bad/abi.json','abi//x','abi/./x']) assert(!localPath(p));
  assert(localPath('abi/OTCBoard.json'));
});
