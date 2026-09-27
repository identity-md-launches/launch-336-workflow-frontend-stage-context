import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { encodeFunctionData, decodeFunctionResult } from 'viem';
const root = new URL('../../', import.meta.url);
const deployment = JSON.parse(await readFile(new URL('dist/imd-deployment.json', root)));
const evidence = { checkedAt: new Date().toISOString(), chainId: deployment.chainId, sourceCommit: deployment.sourceCommit, attempts: [], contracts: [], calls: [], sentTransactions: 0 };
let rpc;
function request(url, method, params) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  const result = JSON.parse(execFileSync('curl', ['--silent','--show-error','--fail','--max-time','18','-H','Content-Type: application/json','--data-binary',body,url], { encoding: 'utf8' }));
  if (result.error) throw Error(JSON.stringify(result.error));
  return result.result;
}
try {
  for (const url of deployment.network.rpcUrls) {
    try { const chain = request(url,'eth_chainId',[]); if (Number(chain) !== deployment.chainId) throw Error(`Unexpected chain ${chain}`); rpc = url; evidence.attempts.push({url,chainId:chain,ok:true}); break; }
    catch (e) { evidence.attempts.push({url,ok:false,error:e.message.slice(0,500)}); }
  }
  if (!rpc) throw Error('All configured public RPCs failed.');
  evidence.rpc = rpc; evidence.block = request(rpc, 'eth_blockNumber', []);
  for (const contract of deployment.contracts) {
    const code = request(rpc, 'eth_getCode', [contract.address, evidence.block]);
    if (!code || code === '0x') throw Error(`No code at ${contract.name}`);
    evidence.contracts.push({name:contract.name,address:contract.address,byteLength:(code.length-2)/2,codeSha256:createHash('sha256').update(Buffer.from(code.slice(2),'hex')).digest('hex')});
    const abi = JSON.parse(await readFile(new URL(`dist/${contract.abiPath}`,root)));
    for (const functionName of contract.name === 'OTCBoard' ? ['featuredToken','orderCount'] : ['name','symbol','decimals','totalSupply']) {
      const data = encodeFunctionData({abi,functionName});
      const result = request(rpc, 'eth_call', [{ to:contract.address, data }, evidence.block]);
      const decoded = decodeFunctionResult({abi,functionName,data:result});
      evidence.calls.push({method:'eth_call',params:[{to:contract.address,data},evidence.block],functionName,result:typeof decoded==='bigint'?decoded.toString():decoded});
      if (functionName==='featuredToken' && decoded.toLowerCase() !== deployment.contracts.find(c=>c.name==='LaunchToken').address.toLowerCase()) throw Error('Featured token mismatch');
    }
  }
  evidence.result = 'PASS';
} catch(e) { evidence.result = 'UNVERIFIED'; evidence.error = e.message; }
await writeFile(new URL('docs/validation/live-read.json',root),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
