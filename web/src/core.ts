import { maxUint256, parseUnits, type Address } from 'viem';
export interface Order {
  id: bigint; maker: Address; token: Address; decimals: number; cancelled: boolean;
  amount: bigint; remaining: bigint; pricePerToken: bigint; expiry: bigint;
}
export const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export function amount(value: string, decimals: number): bigint {
  const clean = value.trim();
  if (!/^\d+(\.\d+)?$/.test(clean)) throw Error('Enter a positive number without commas or exponent notation.');
  if ((clean.split('.')[1]?.length ?? 0) > decimals) throw Error(`Use no more than ${decimals} decimal places.`);
  const units = parseUnits(clean, decimals);
  if (units <= 0n || units > maxUint256) throw Error('Enter an amount greater than zero and within the token limit.');
  return units;
}
export function stateOf(order: Order, now: bigint) {
  return order.cancelled ? 'Cancelled' : order.remaining === 0n ? 'Filled' : order.expiry <= now ? 'Expired' : 'Open';
}
export function canFill(order: Order, account: Address | undefined, now: bigint) {
  return !!account && !same(order.maker, account) && stateOf(order, now) === 'Open';
}
export function canCancel(order: Order, account: Address | undefined) {
  return same(order.maker, account) && !order.cancelled && order.remaining > 0n;
}
const contractErrors: Record<string, string> = {
  OrderExpired: 'This order has expired. Refresh the board and choose an open order.',
  OrderCancelled: 'This order was cancelled. Refresh the board and choose an open order.',
  AmountExceedsRemaining: 'Fewer tokens remain. Refresh the order and request a smaller quote.',
  MakerCannotFill: 'You cannot buy your own order. Use a different order.',
  IncorrectPayment: 'The ETH payment does not match the quote. Request a fresh quote.',
  NotMaker: 'Only the maker can cancel this order. Check your connected wallet.',
  NothingToCancel: 'No tokens remain to cancel. Refresh the board.',
  NothingToWithdraw: 'No ETH proceeds are available. Refresh your balance.',
  UnsupportedToken: 'This token is unsupported. Choose an ERC-20 with 0–30 decimals.',
  InvalidExpiry: 'The order duration is invalid. Refresh state and try again.',
  EthTransferFailed: 'Your wallet could not receive ETH. Review its receiving permissions.',
  ERC20InsufficientBalance: 'Your token balance is too low. Reduce the amount.',
  ERC20InsufficientAllowance: 'The allowance is too low. Approve the amount first.',
};
export function describeError(error: unknown): string {
  type Detail = { code?: number; shortMessage?: string; message?: string; cause?: Detail; data?: { errorName?: string }; reason?: string };
  const e = error as Detail;
  if (e?.code === 4001 || /rejected|denied/i.test(e?.message ?? '')) return 'Request rejected in your wallet. Nothing was submitted; you can try again.';
  let current: Detail | undefined = e;
  for (let depth = 0; current && depth < 8; depth++, current = current.cause) {
    const name = current.data?.errorName;
    if (name) return `${contractErrors[name] || 'The contract rejected this action. Refresh state and review your inputs.'} (${name})`;
    if (current.reason) return `Transaction rejected: ${current.reason.slice(0, 300)}. Refresh state before trying again.`;
  }
  return (e?.shortMessage || e?.message || 'Unable to complete the request. Check your connection and try again.').slice(0, 600);
}
export type Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
};
declare global { interface Window { ethereum?: Provider } }
export async function switchChain(provider: Provider, chainId: number, addChain: unknown) {
  const params = [{ chainId: `0x${chainId.toString(16)}` }];
  try { await provider.request({ method: 'wallet_switchEthereumChain', params }); }
  catch (error) {
    const e = error as { code?: number; message?: string; data?: { originalError?: { code?: number } } };
    if (e.code !== 4902 && e.data?.originalError?.code !== 4902 && !/unknown chain|unrecognized chain|chain.*not.*added/i.test(e.message ?? '')) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [addChain] });
    await provider.request({ method: 'wallet_switchEthereumChain', params });
  }
}
