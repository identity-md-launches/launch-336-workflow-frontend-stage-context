import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { decodeFunctionData, encodeFunctionResult, encodeErrorResult, parseEther, toHex } from 'viem';
const root = fileURLToPath(new URL('../../', import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve(root,'web/node_modules/.cache/ms-playwright');
const { chromium, expect } = await import('@playwright/test');
const { default: AxeBuilder } = await import('@axe-core/playwright');
const out = resolve(root,'docs/validation'); await mkdir(out,{recursive:true});
const manifest = JSON.parse(await readFile(resolve(root,'dist/imd-deployment.json'),'utf8'));
const board = manifest.contracts.find(c=>c.name==='OTCBoard');
const token = manifest.contracts.find(c=>c.name==='LaunchToken');
const boardAbi = JSON.parse(await readFile(resolve(root,'dist',board.abiPath),'utf8'));
const tokenAbi = JSON.parse(await readFile(resolve(root,'dist',token.abiPath),'utf8'));
const account = '0x1111111111111111111111111111111111111111';
const other = '0x2222222222222222222222222222222222222222';
const sixToken = '0x3333333333333333333333333333333333333333';
const now = BigInt(Math.floor(Date.now()/1000));
const blockHash = `0x${'a'.repeat(64)}`;
const evidence = { checkedAt:new Date().toISOString(), scope:'Production export under /preview/, intercepted RPC and injected mock wallet; no broadcasts.', checks:[], screenshots:[], consoleErrors:[], resourceFailures:[], contrast:[], transactions:[] };
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const server = createServer(async(req,res)=>{
  try { const url = new URL(req.url,'http://local'); const p = decodeURIComponent(url.pathname).replace(/^\/preview\//,''); if(url.pathname === '/preview/') { res.setHeader('Content-Type','text/html');res.end(await readFile(resolve(root,'dist/index.html')));return; } const full=resolve(root,'dist',p); if(!full.startsWith(resolve(root,'dist')+'/')) throw Error('Invalid path'); res.setHeader('Content-Type',mime[extname(p)]||'application/octet-stream'); res.end(await readFile(full)); }
  catch {res.statusCode=404;res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base = `http://127.0.0.1:${server.address().port}/preview/`;
let browser;
const M = { allowance:0n,balance:parseEther('100'),credit:parseEther('0.5'),count:4n,failReads:false,simulateError:false,noCode:false,receipts:new Map(),calls:[],txs:[],orders:[
  {maker:other,token:token.address,decimals:18,cancelled:false,amount:parseEther('30'),remaining:parseEther('30'),pricePerToken:parseEther('0.001'),expiry:now+604800n},
  {maker:account,token:token.address,decimals:18,cancelled:false,amount:parseEther('4'),remaining:parseEther('4'),pricePerToken:parseEther('0.002'),expiry:now-100n},
  {maker:account,token:token.address,decimals:18,cancelled:false,amount:parseEther('8'),remaining:parseEther('3'),pricePerToken:parseEther('0.003'),expiry:now+604800n},
  {maker:other,token:sixToken,decimals:6,cancelled:false,amount:2000000n,remaining:2000000n,pricePerToken:1n,expiry:now+604800n},
] };
const qtyCost = (o,a) => (a*o.pricePerToken+10n**BigInt(o.decimals)-1n)/10n**BigInt(o.decimals);
function block() { return {number:'0x1234',hash:blockHash,parentHash:blockHash,nonce:'0x0000000000000000',sha3Uncles:blockHash,logsBloom:`0x${'0'.repeat(512)}`,transactionsRoot:blockHash,stateRoot:blockHash,receiptsRoot:blockHash,miner:other,difficulty:'0x0',totalDifficulty:'0x0',extraData:'0x',size:'0x100',gasLimit:'0x1c9c380',gasUsed:'0x0',timestamp:toHex(now),transactions:[],uncles:[],baseFeePerGas:'0x1'}; }
function rpc(method,params) {
  if(M.failReads && method==='eth_call') throw {code:-32000,message:'Mock RPC unavailable'};
  if(method==='eth_chainId') return toHex(manifest.chainId);
  if(method==='eth_getCode') return M.noCode ? '0x' : '0x6001600055';
  if(method==='eth_blockNumber') return '0x1234';
  if(method==='eth_getBlockByNumber') return block();
  if(method==='eth_getTransactionReceipt') return M.receipts.get(params[0]) || null;
  if(method==='eth_getTransactionCount') return '0x0';
  if(method==='eth_estimateGas') return '0x50000';
  if(method==='eth_gasPrice') return '0x1';
  if(method==='eth_call') {
    const tx=params[0],isBoard=tx.to.toLowerCase()===board.address.toLowerCase(),abi=isBoard?boardAbi:tokenAbi;
    const {functionName:f,args=[]}=decodeFunctionData({abi,data:tx.data}); M.calls.push({f,args,from:tx.from});
    let result;
    if(isBoard) {
      if(f==='featuredToken') result=token.address;
      else if(f==='orderCount') result=M.count;
      else if(f==='order') result=M.orders[Number(args[0])-1];
      else if(f==='withdrawable') result=M.credit;
      else if(f==='quote') result=qtyCost(M.orders[Number(args[0])-1],args[1]);
      else {
        if(M.simulateError) throw {code:3,message:'execution reverted',data:encodeErrorResult({abi:boardAbi,errorName:'OrderExpired',args:[1n]})};
        result=f==='post'?M.count+1n:undefined;
      }
    } else {
      if(f==='decimals') result=tx.to.toLowerCase()===sixToken.toLowerCase()?6:18;
      else if(f==='symbol') result=tx.to.toLowerCase()===sixToken.toLowerCase()?'SIX':'DESK';
      else if(f==='balanceOf') result=M.balance;
      else if(f==='allowance') result=M.allowance;
      else if(f==='approve') result=true;
      else throw Error(`Unexpected token call ${f}`);
    }
    return encodeFunctionResult({abi,functionName:f,result});
  }
  throw Error(`Unhandled RPC ${method}`);
}
function send(tx) {
  const isBoard=tx.to.toLowerCase()===board.address.toLowerCase(),abi=isBoard?boardAbi:tokenAbi;
  const {functionName:f,args=[]}=decodeFunctionData({abi,data:tx.data});
  const hash=`0x${String(M.txs.length+1).padStart(64,'0')}`;
  assert(M.calls.some(call=>call.f===f && call.from),'Write must have a prior simulation from an account');
  if(f==='approve') { assert.equal(args[0].toLowerCase(),board.address.toLowerCase()); M.allowance=args[1]; }
  if(f==='post') { assert(M.allowance>=args[1]); M.balance-=args[1]; M.allowance-=args[1]; M.count++; M.orders.push({maker:account,token:args[0],decimals:args[0].toLowerCase()===sixToken.toLowerCase()?6:18,cancelled:false,amount:args[1],remaining:args[1],pricePerToken:args[2],expiry:args[3]}); }
  if(f==='fill') { const o=M.orders[Number(args[0])-1]; assert.equal(BigInt(tx.value),qtyCost(o,args[1])); assert.notEqual(o.maker,account); o.remaining-=args[1]; }
  if(f==='cancel') { const o=M.orders[Number(args[0])-1]; assert.equal(o.maker,account); M.balance+=o.remaining; o.remaining=0n;o.cancelled=true; }
  if(f==='withdraw') M.credit=0n;
  M.txs.push({functionName:f,args,tx,hash});
  M.receipts.set(hash,{transactionHash:hash,transactionIndex:'0x0',blockHash,blockNumber:'0x1234',from:account,to:tx.to,cumulativeGasUsed:'0x5208',gasUsed:'0x5208',contractAddress:null,logs:[],logsBloom:`0x${'0'.repeat(512)}`,status:'0x1',effectiveGasPrice:'0x1',type:'0x2'});
  return hash;
}
async function mock(page,{wallet=true,chain='0x1'}={}) {
  page.on('pageerror',e=>evidence.consoleErrors.push(e.message));
  page.on('console',message=>{if(message.type()==='error') evidence.consoleErrors.push(message.text());});
  page.on('requestfailed',r=>evidence.resourceFailures.push({url:r.url(),error:r.failure()?.errorText}));
  await page.route('https://**',async route=>{
    const request=route.request();
    if(request.method()==='OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
    const data=request.postDataJSON();
    const handle=q=>{try{return {jsonrpc:'2.0',id:q.id,result:rpc(q.method,q.params)}}catch(e){return {jsonrpc:'2.0',id:q.id,error:{code:e.code||-32000,message:e.message||String(e),...(e.data?{data:e.data}:{})}}}};
    await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(Array.isArray(data)?data.map(handle):handle(data))});
  });
  await page.route('**/__wallet',async route=> { const {tx}=route.request().postDataJSON(); await route.fulfill({contentType:'application/json',body:JSON.stringify({hash:send(tx)})}); });
  if(wallet) await page.addInitScript(({account,chain})=>{
    const state=window.__wallet={connected:false,chain,added:false,reject:false,calls:[],listeners:{}};
    window.ethereum={request:async request=>{
      state.calls.push(request);
      if(request.method==='eth_accounts') return state.connected?[account]:[];
      if(request.method==='eth_chainId') return state.chain;
      if(request.method==='eth_requestAccounts') { if(state.reject) throw {code:4001,message:'User rejected'};state.connected=true;return [account]; }
      if(request.method==='wallet_switchEthereumChain') {if(!state.added)throw {code:4902,message:'Unknown chain'};state.chain=request.params[0].chainId;for(const listener of state.listeners.chainChanged||[])listener(state.chain);return null;}
      if(request.method==='wallet_addEthereumChain'){state.added=true;return null;}
      if(request.method==='eth_sendTransaction'){if(state.reject)throw {code:4001,message:'User rejected'};const r=await fetch('./__wallet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tx:request.params[0]})});return (await r.json()).hash;}
      throw Error(`Unexpected wallet call ${request.method}`);
    },on:(event,fn)=>{(state.listeners[event]||=[]).push(fn)},removeListener:(event,fn)=>{state.listeners[event]=(state.listeners[event]||[]).filter(v=>v!==fn)}};
  },{account,chain});
}
async function check(name,fn){await fn();evidence.checks.push({name,result:'PASS'});console.log(`PASS ${name}`);}
async function stable(page){await expect(page.getByRole('button',{name:'Refresh state',exact:false})).toBeEnabled();}
async function screenshot(page,name){await page.bringToFront();await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});await page.screenshot({path:resolve(out,name),fullPage:true});evidence.screenshots.push(`docs/validation/${name}`);}
try {
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
  const page=await context.newPage(); await mock(page); await page.goto(base); await stable(page);
  await check('Disconnected: live orders readable, all transaction controls disabled',async()=>{await expect(page.getByText('Deployment checked',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Approve DESK',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Post order',exact:true})).toBeDisabled();});
  await screenshot(page,'desktop-disconnected.png');
  evidence.activeAccent = await page.getByRole('button',{name:'Connect wallet'}).evaluate(el=>({foreground:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));
  await check('Keyboard: skip link reaches main; wallet connection rejection is recoverable',async()=>{await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to order book'})).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('main')).toBeFocused();await page.evaluate(()=>window.__wallet.reject=true);await page.getByRole('button',{name:'Connect wallet'}).click();await expect(page.getByRole('alert')).toContainText('Request rejected');await page.evaluate(()=>window.__wallet.reject=false);await page.getByRole('button',{name:'Connect wallet'}).click();});
  await check('Wrong chain: disables actions, 4902 adds exact handoff network then switches',async()=>{await expect(page.getByText('Wallet is on a different network.')).toBeVisible();await expect(page.getByRole('button',{name:'Approve DESK',exact:true})).toBeDisabled();await screenshot(page,'wrong-network.png');await page.getByRole('button',{name:'Switch to Sepolia'}).click();await expect(page.getByText('Wallet is on a different network.')).toHaveCount(0);await stable(page);const calls=await page.evaluate(()=>window.__wallet.calls);assert.deepEqual(calls.find(c=>c.method==='wallet_addEthereumChain').params,[manifest.walletAddChain]);});
  await check('Approval validates amount, focuses error and writes exact board allowance',async()=>{await page.getByRole('button',{name:'Approve DESK',exact:true}).click();await expect(page.locator('#post-quantity')).toHaveAttribute('aria-invalid','true');await expect(page.locator('#post-quantity')).toBeFocused();await page.locator('#post-quantity').fill('2');await page.locator('#post-price').focus();await page.keyboard.press('Tab');await expect(page.locator('#post-expiry')).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Approve DESK',exact:true})).toBeFocused();await screenshot(page,'keyboard-approval-focus.png');await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'Amount approved'})).toBeVisible();assert.equal(M.txs.at(-1).functionName,'approve');assert.equal(M.allowance,parseEther('2'));});
  await check('Post validates price and escrows correct token/amount/price/duration',async()=>{await page.getByRole('button',{name:'Post order',exact:true}).click();await expect(page.locator('#post-price')).toBeFocused();await page.locator('#post-price').fill('0.005');await page.getByRole('button',{name:'Post order',exact:true}).click();await expect.poll(()=>M.txs.at(-1)?.functionName).toBe('post');await stable(page);await expect(page.getByText('Order #5',{exact:false})).toBeVisible();assert.equal(M.txs.at(-1).args[0].toLowerCase(),token.address);assert.deepEqual(M.txs.at(-1).args.slice(1),[parseEther('2'),parseEther('0.005'),now+604800n]);});
  await screenshot(page,'desktop-posted.png');
  const first=page.locator('article').filter({hasText:'Order #1 '});
  await check('Exact quote invalidates when edited; buy sends exact rounded ETH and refreshes',async()=>{await first.getByRole('button',{name:'View order'}).click();await first.getByLabel('Amount to buy (DESK)').fill('2');await first.getByRole('button',{name:'Get exact quote'}).click();await expect(first.getByRole('button',{name:'Buy for 0.002 ETH'})).toBeVisible();await first.getByLabel('Amount to buy (DESK)').fill('3');await expect(first.getByRole('button',{name:/Buy for/})).toHaveCount(0);await first.getByLabel('Amount to buy (DESK)').fill('2');await first.getByRole('button',{name:'Get exact quote'}).click();await first.getByRole('button',{name:'Buy for 0.002 ETH'}).click();await expect.poll(()=>M.txs.at(-1)?.functionName).toBe('fill');await stable(page);assert.equal(M.orders[0].remaining,parseEther('28'));assert.equal(BigInt(M.txs.at(-1).tx.value),parseEther('0.002'));});
  await check('Simulation revert is surfaced and prevents wallet transaction',async()=>{M.simulateError=true;await first.getByLabel('Amount to buy (DESK)').fill('1');await first.getByRole('button',{name:'Get exact quote'}).click();const count=M.txs.length;await first.getByRole('button',{name:'Buy for 0.001 ETH'}).click();await expect(page.getByRole('alert')).toContainText('OrderExpired');assert.equal(M.txs.length,count);M.simulateError=false;await stable(page);});
  await check('Rejected transaction keeps onchain state unchanged',async()=>{await page.evaluate(()=>window.__wallet.reject=true);const count=M.txs.length;await first.getByRole('button',{name:'Buy for 0.001 ETH'}).click();await expect(page.getByRole('alert')).toContainText('Request rejected');assert.equal(M.txs.length,count);await page.evaluate(()=>window.__wallet.reject=false);await stable(page);});
  await check('Expired maker order can be cancelled with explicit confirmation',async()=>{await page.getByRole('button',{name:'My orders',exact:true}).click();const row=page.locator('article').filter({hasText:'Order #2 '});await row.getByRole('button',{name:'Manage order'}).click();await row.getByRole('button',{name:'Cancel order',exact:true}).click();await row.getByRole('button',{name:'Keep order'}).click();assert(!M.orders[1].cancelled);await row.getByRole('button',{name:'Cancel order',exact:true}).click();await row.getByRole('button',{name:'Confirm cancellation'}).click();await expect.poll(()=>M.orders[1].cancelled).toBe(true);await stable(page);});
  await check('Withdraw credits, then disable zero-credit withdrawal',async()=>{await page.getByRole('button',{name:'Withdraw ETH',exact:false}).click();await expect.poll(()=>M.credit).toBe(0n);await stable(page);await expect(page.getByRole('button',{name:'Withdraw ETH',exact:false})).toBeDisabled();});
  await check('Token filter rejects invalid address and supports six-decimal dust with one-wei quote',async()=>{await page.locator('#token-address').fill('bad address');await page.getByRole('button',{name:'Load token',exact:true}).click();await expect(page.locator('#token-address')).toHaveAttribute('aria-invalid','true');await page.locator('#token-address').fill(sixToken);await page.getByRole('button',{name:'Load token',exact:true}).click();await page.getByRole('button',{name:'Open orders',exact:true}).click();await stable(page);const row=page.locator('article').filter({hasText:'Order #4 '});await row.getByRole('button',{name:'View order'}).click();await row.getByLabel('Amount to buy (SIX)').fill('0.000001');await row.getByRole('button',{name:'Get exact quote'}).click();await expect(row.getByRole('button',{name:'Buy for 0.000000000000000001 ETH'})).toBeVisible();await row.getByRole('button',{name:'Buy for 0.000000000000000001 ETH'}).click();await expect.poll(()=>M.txs.at(-1)?.args[0]).toBe(4n);assert.equal(BigInt(M.txs.at(-1).tx.value),1n);await stable(page);await page.getByRole('button',{name:'Reset to DESK'}).click();await stable(page);});
  await check('Account change clears selection and replaces account state',async()=>{await page.evaluate(()=>{for(const fn of window.__wallet.listeners.accountsChanged)fn([])});await expect(page.getByRole('button',{name:'Connect wallet'})).toBeVisible();await page.getByRole('button',{name:'Connect wallet'}).click();await stable(page);});
  await check('RPC read failure gates transactions and retry recovers',async()=>{M.failReads=true;await page.getByRole('button',{name:'Refresh state',exact:false}).click();await expect(page.getByRole('alert')).toContainText('Unable to read the board',{timeout:30000});await expect(page.getByRole('button',{name:'Approve DESK',exact:true})).toBeDisabled();M.failReads=false;await page.getByRole('button',{name:'Refresh state',exact:false}).click();await stable(page);await expect(page.getByText('Unable to read the board.',{exact:false})).toHaveCount(0);});
  if (await page.getByRole('button',{name:'Dismiss message'}).count()) await page.getByRole('button',{name:'Dismiss message'}).click();
  await page.getByRole('button',{name:'Open orders',exact:true}).click();
  await check('Axe WCAG A/AA scan: connected desktop',async()=>{const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();evidence.axe={violations:results.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),passes:results.passes.length};assert.deepEqual(evidence.axe.violations,[]);});
  for(const width of [1440,900,768,390,320]) await check(`Responsive ${width}px: no horizontal overflow`,async()=>{await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot(page,`viewport-${width}.png`);});
  await check('Text enlargement to 200% at 768px reflows without horizontal overflow',async()=>{await page.setViewportSize({width:768,height:1000});await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot(page,'text-200-percent.png');await page.evaluate(()=>document.documentElement.style.fontSize='');});
  await page.setViewportSize({width:1440,height:1100});
  evidence.contrast=await page.evaluate(()=>{
    const lum=c=>{const a=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722};
    return ['h1','.intro-copy p','.hint','.eyebrow','.order-state.open','.primary','#post-quantity'].map(selector=>{const el=document.querySelector(selector);const css=getComputedStyle(el);let p=el,bg=css.backgroundColor;while(bg==='rgba(0, 0, 0, 0)'&&p.parentElement){p=p.parentElement;bg=getComputedStyle(p).backgroundColor;}return {selector,foreground:css.color,background:bg,ratio:+((Math.max(lum(css.color),lum(bg))+.05)/(Math.min(lum(css.color),lum(bg))+.05)).toFixed(2),disabled:el.matches(':disabled'),border:css.borderColor,borderContrast:selector==='#post-quantity'?+((Math.max(lum(css.borderColor),lum(bg))+.05)/(Math.min(lum(css.borderColor),lum(bg))+.05)).toFixed(2):undefined};});
  });
  const originalCount=M.count; const originalLength=M.orders.length;
  for(let i=0;i<15;i++) M.orders.push({...M.orders[3]}); M.count=BigInt(M.orders.length);
  const paginated=await context.newPage();await mock(paginated);await paginated.goto(base);await stable(paginated);
  await check('Pagination searches older orders without presenting the partial range as complete',async()=>{await expect(paginated.getByText('A clear desk. An open market.')).toBeVisible();await expect(paginated.getByText('12 of 20 total orders loaded',{exact:false})).toBeVisible();await paginated.getByRole('button',{name:'Load 12 older orders'}).click();await expect(paginated.getByText('Order #1 ',{exact:false})).toBeVisible();await expect(paginated.getByText('20 of 20 total orders loaded',{exact:false})).toBeVisible();});await paginated.close();M.count=originalCount;M.orders.length=originalLength;
  const savedOrders=M.orders;const savedCount=M.count;M.orders=[];M.count=0n;
  const empty=await context.newPage();await mock(empty);await empty.goto(base);await stable(empty);await expect(empty.getByText('A clear desk. An open market.')).toBeVisible();await screenshot(empty,'empty-board.png');evidence.checks.push({name:'Empty board explains how to post the first order',result:'PASS'});await empty.close();M.orders=savedOrders;M.count=savedCount;
  const missing=await context.newPage();await mock(missing,{wallet:false});await missing.goto(base);await stable(missing);
  await check('Missing wallet shows install/open guidance',async()=>{await missing.getByRole('button',{name:'Connect wallet'}).click();await expect(missing.getByRole('alert')).toContainText('No browser wallet found');});await missing.close();
  M.noCode=true;const noCode=await context.newPage();await mock(noCode);await noCode.goto(base);
  await check('Empty deployed code blocks transactions',async()=>{await expect(noCode.getByRole('alert')).toContainText('No deployed code');await expect(noCode.getByRole('button',{name:'Approve DESK',exact:true})).toBeDisabled();});await noCode.close();M.noCode=false;
  const broken=await context.newPage();await mock(broken);await broken.route('**/abi/OTCBoard.json',route=>route.fulfill({contentType:'application/json',body:'[]'}));await broken.goto(base);
  await check('ABI tamper fails closed before any controls load',async()=>{await expect(broken.getByRole('alert')).toContainText('ABI verification failed');await expect(broken.getByRole('button',{name:'Retry loading'})).toBeVisible();});await broken.close();
  evidence.transactions=M.txs.map(tx=>({functionName:tx.functionName,args:tx.args,transaction:tx.tx}));
  assert.deepEqual(evidence.consoleErrors,[]);assert.deepEqual(evidence.resourceFailures,[]); evidence.result='PASS';
} catch(e) {evidence.result='FAIL';evidence.error=e.stack;console.error(e);process.exitCode=1;}
finally {await writeFile(resolve(out,'browser-results.json'),JSON.stringify(evidence,(_,value)=>typeof value==='bigint'?value.toString():value,2)+'\n');await browser?.close();await new Promise(r=>server.close(r));}
