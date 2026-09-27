import { keccak256, toHex } from 'viem';
/** Handoff canonical JSON: recursively sorted object keys, array order preserved. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const abiHash = (value: unknown) => keccak256(toHex(canonical(value))).slice(2);
export function localPath(path: string) {
  return typeof path === 'string' && /^[a-zA-Z0-9_./-]+$/.test(path) && !path.startsWith('/') && !path.split('/').some(part => part === '..' || part === '.' || part === '');
}
