import { createPublicClient, defineChain, fallback, http, isAddress, type Abi, type Address } from 'viem';
import { abiHash, localPath } from './integrity';
export interface Deployment {
  version: 1; launchId: string; chainId: number; sourceCommit: string; attestationHash: string;
  contracts: { name: string; address: Address; abiHash: string; abiPath: string }[];
  assets: { path: string; sha256: string }[];
  network: { chainId: number; name: string; testnet: boolean; rpcUrls: string[]; explorer: string; nativeCurrency: { name: string; symbol: string; decimals: number }; faucets: string[]; uniswapV4: Record<string, Address> };
  walletAddChain: { chainId: string; chainName: string; rpcUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls: string[] };
}
async function json(path: string) {
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok) throw Error(`Could not load ${path}. Reload to retry.`);
  return response.json();
}
export async function loadConfig() {
  const deployment: Deployment = await json('imd-deployment.json');
  const { network } = deployment;
  if (deployment.version !== 1 || network.chainId !== deployment.chainId || Number(deployment.walletAddChain.chainId) !== deployment.chainId || !network.rpcUrls.length) throw Error('Deployment network is inconsistent. Transactions are disabled.');
  const loaded = await Promise.all(deployment.contracts.map(async contract => {
    if (!isAddress(contract.address) || !localPath(contract.abiPath)) throw Error('Invalid contract configuration.');
    const abi: Abi = await json(contract.abiPath);
    if (!Array.isArray(abi) || abiHash(abi) !== contract.abiHash) throw Error(`ABI verification failed for ${contract.name}. Transactions are disabled.`);
    return { ...contract, abi: abi as Abi };
  }));
  const board = loaded.find(c => c.name === 'OTCBoard');
  const token = loaded.find(c => c.name === 'LaunchToken');
  if (!board || !token) throw Error('Required contracts are missing.');
  const chain = defineChain({ id: deployment.chainId, name: network.name, nativeCurrency: network.nativeCurrency, rpcUrls: { default: { http: network.rpcUrls } }, blockExplorers: { default: { name: 'Explorer', url: network.explorer } }, testnet: network.testnet });
  const client = createPublicClient({ chain, transport: fallback(network.rpcUrls.map(url => http(url, { timeout: 7000, retryCount: 0 })), { retryCount: 0 }) });
  return { deployment, chain, client, board, token };
}
export type Config = Awaited<ReturnType<typeof loadConfig>>;
export async function verifyDeployment(config: Config) {
  if (await config.client.getChainId() !== config.deployment.chainId) throw Error('The RPC returned a different network. Retry before trading.');
  for (const contract of config.deployment.contracts) {
    const code = await config.client.getCode({ address: contract.address });
    if (!code || code === '0x') throw Error(`No deployed code at ${contract.name}. Transactions are disabled.`);
  }
  const featured = await config.client.readContract({ address: config.board.address, abi: config.board.abi, functionName: 'featuredToken' }) as Address;
  if (featured.toLowerCase() !== config.token.address.toLowerCase()) throw Error('The featured token does not match this deployment.');
}
