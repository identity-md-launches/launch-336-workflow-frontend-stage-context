import { createWalletClient, custom, isAddress, type Address, type Abi } from 'viem';
import type { Config } from './config';
import { canCancel, canFill, same, type Order, type Provider } from './core';
export interface Snapshot { orders: Order[]; count: bigint; credit: bigint; balance: bigint; allowance: bigint; decimals: number; symbol: string; block: bigint; time: bigint; loaded: number; }
export async function readSnapshot(c: Config, token: Address, account: Address | undefined, limit: number): Promise<Snapshot> {
  const block = await c.client.getBlock();
  const read = (address: Address, abi: Abi, functionName: string, args?: readonly unknown[]) => c.client.readContract({ address, abi, functionName, args, blockNumber: block.number });
  const board = (name: string, args?: readonly unknown[]) => read(c.board.address, c.board.abi, name, args);
  const erc20 = (name: string, args?: readonly unknown[]) => read(token, c.token.abi, name, args);
  const [count, decimals, symbol, credit, balance, allowance] = await Promise.all([
    board('orderCount') as Promise<bigint>, erc20('decimals') as Promise<number>,
    erc20('symbol').catch(() => 'TOKEN') as Promise<string>,
    account ? board('withdrawable', [account]) as Promise<bigint> : 0n,
    account ? erc20('balanceOf', [account]) as Promise<bigint> : 0n,
    account ? erc20('allowance', [account, c.board.address]) as Promise<bigint> : 0n,
  ]);
  if (decimals > 30 || decimals < 0) throw Error('This token has unsupported decimals. Choose a token with 0–30 decimals.');
  const loaded = Number(count < BigInt(limit) ? count : BigInt(limit));
  const orders: Order[] = [];
  for (let offset = 0; offset < loaded; offset += 6) {
    const batch = Array.from({ length: Math.min(6, loaded - offset) }, (_, i) => count - BigInt(offset + i));
    orders.push(...await Promise.all(batch.map(async id => ({ ...await board('order', [id]) as Omit<Order, 'id'>, id }))));
  }
  return { orders, count, decimals, symbol: typeof symbol === 'string' ? symbol.slice(0, 40) : 'TOKEN', credit, balance, allowance, block: block.number, time: block.timestamp, loaded };
}
export type Action =
  | { kind: 'approve'; token: Address; amount: bigint }
  | { kind: 'post'; token: Address; amount: bigint; price: bigint; expiry: bigint }
  | { kind: 'fill'; id: bigint; amount: bigint; cost: bigint }
  | { kind: 'cancel'; id: bigint }
  | { kind: 'withdraw' };
export async function transact(c: Config, provider: Provider, account: Address, action: Action, status: (message: string, hash?: `0x${string}`) => void) {
  const checkWallet = async () => {
    const chain = Number(await provider.request({ method: 'eth_chainId' }));
    const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
    if (chain !== c.chain.id || !same(accounts[0], account)) throw Error('Your wallet account or network changed. Reconnect and review the action.');
  };
  await checkWallet();
  if (await c.client.getChainId() !== c.chain.id) throw Error('RPC network mismatch. Transactions are disabled.');
  let address = c.board.address, abi = c.board.abi, functionName: string = action.kind, args: readonly unknown[] = [], value: bigint | undefined;
  if (action.kind === 'approve') { address = action.token; abi = c.token.abi; args = [c.board.address, action.amount]; }
  if (action.kind === 'post') args = [action.token, action.amount, action.price, action.expiry];
  if (action.kind === 'cancel' || action.kind === 'fill') {
    const order = { ...await c.client.readContract({ address, abi, functionName: 'order', args: [action.id] }) as Omit<Order, 'id'>, id: action.id };
    if (action.kind === 'cancel') {
      if (!canCancel(order, account)) throw Error('This order cannot be cancelled by your wallet. Refresh the board.');
      args = [action.id];
    } else {
      const block = await c.client.getBlock();
      if (!canFill(order, account, block.timestamp) || action.amount > order.remaining) throw Error('This order is no longer available for that amount. Refresh the board.');
      const freshCost = await c.client.readContract({ address, abi, functionName: 'quote', args: [action.id, action.amount] }) as bigint;
      if (freshCost !== action.cost) throw Error('The quote changed. Request a new quote before buying.');
      args = [action.id, action.amount]; value = freshCost;
    }
  }
  status('Checking this transaction…');
  const { request } = await c.client.simulateContract({ account, address, abi, functionName, args, ...(value !== undefined ? { value } : {}) });
  // Recheck after the asynchronous simulation and before requesting a signature.
  await checkWallet();
  status('Review and confirm in your wallet…');
  const wallet = createWalletClient({ account, chain: c.chain, transport: custom(provider) });
  const hash = await wallet.writeContract(request);
  status('Submitted. Waiting for confirmation…', hash);
  let replacedAction = false;
  const receipt = await c.client.waitForTransactionReceipt({ hash, timeout: 120_000, onReplaced: replacement => {
    if (replacement.reason !== 'repriced') replacedAction = true;
    status('Transaction replaced. Waiting for confirmation…', replacement.transaction.hash);
  } });
  if (replacedAction) throw Error('Your wallet replaced or cancelled the requested action. Check the linked transaction and refresh the board.');
  if (receipt.status !== 'success') throw Error('Transaction reverted. Your wallet paid gas; the action did not complete. Refresh and review before trying again.');
  status('Transaction confirmed. Refreshing the board…', receipt.transactionHash);
  return receipt.transactionHash;
}
export function tokenAddress(input: string): Address {
  if (!isAddress(input.trim()) || /^0x0{40}$/i.test(input.trim())) throw Error('Enter a valid ERC-20 contract address.');
  return input.trim() as Address;
}
