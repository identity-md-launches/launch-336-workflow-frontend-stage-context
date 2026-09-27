import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatEther, formatUnits, type Address } from 'viem';
import { loadConfig, verifyDeployment, type Config } from './config';
import { readSnapshot, tokenAddress, transact, type Action, type Snapshot } from './chain';
import { amount, canCancel, canFill, describeError, same, stateOf, switchChain, type Order } from './core';
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const units = (n: bigint, d: number) => formatUnits(n, d);
function AddressLink({ c, address, label }: { c: Config; address: Address; label?: string }) {
  return <a href={`${c.deployment.network.explorer}/address/${address}`} target="_blank" rel="noreferrer" title={address} aria-label={`${label || 'Address'} ${address} on explorer`}>{label || short(address)} <span aria-hidden="true">↗</span></a>;
}
export default function App() {
  const [config, setConfig] = useState<Config>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    loadConfig().then(c => { if (active) setConfig(c); }).catch(e => { if (active) setError(describeError(e)); });
    return () => { active = false; };
  }, [retry]);
  if (!config) return <main className="boot"><span className="wordmark">desk<span className="brand-dot">.</span></span><h1>Release Desk</h1><p role={error ? 'alert' : 'status'}>{error || 'Loading the deployment and verifying its ABIs…'}</p>{error && <button onClick={() => setRetry(v => v + 1)}>Retry loading</button>}</main>;
  return <Desk c={config}/>;
}
function Desk({ c }: { c: Config }) {
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [verificationTry, setVerificationTry] = useState(0);
  const [token, setToken] = useState(c.token.address);
  const [tokenInput, setTokenInput] = useState(c.token.address as string);
  const [tokenError, setTokenError] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [readError, setReadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(12);
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState('open');
  const [selected, setSelected] = useState<bigint>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [status, setStatus] = useState('');
  const [actionError, setActionError] = useState('');
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [syncedAt, setSyncedAt] = useState(Date.now());
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    let active = true;
    setVerified(false); setVerificationError('');
    verifyDeployment(c).then(() => { if (active) setVerified(true); }).catch(e => { if (active) setVerificationError(describeError(e)); });
    return () => { active = false; };
  }, [c, verificationTry]);
  useEffect(() => {
    const p = window.ethereum;
    if (!p) return;
    let active = true;
    const accounts = (...args: unknown[]) => { if (active) { setAccount((args[0] as Address[])[0]); setSelected(undefined); setStatus(''); setActionError(''); } };
    const chain = (...args: unknown[]) => { if (active) { setChainId(Number(args[0])); setSelected(undefined); } };
    const disconnected = () => { if (active) { setAccount(undefined); setChainId(undefined); } };
    p.request({ method: 'eth_accounts' }).then(a => accounts(a)).catch(() => {});
    p.request({ method: 'eth_chainId' }).then(id => chain(id)).catch(() => {});
    p.on?.('accountsChanged', accounts); p.on?.('chainChanged', chain); p.on?.('disconnect', disconnected);
    return () => { active = false; p.removeListener?.('accountsChanged', accounts); p.removeListener?.('chainChanged', chain); p.removeListener?.('disconnect', disconnected); };
  }, []);
  useEffect(() => { const id = setInterval(() => { if (!document.hidden && !lock.current) setRefresh(v => v + 1); }, 20000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (!verified) return;
    let active = true;
    setLoading(true); setReadError('');
    readSnapshot(c, token, account, limit).then(s => { if (active) { setSnapshot(s); setSyncedAt(Date.now()); } }).catch(e => { if (active) { setSnapshot(undefined); setReadError(describeError(e)); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [c, token, account, limit, refresh, verified]);
  const now = snapshot ? snapshot.time + BigInt(Math.max(0, Math.floor((clock - syncedAt) / 1000))) : 0n;
  const wrongChain = !!account && chainId !== c.chain.id;
  const ready = !!account && !wrongChain && verified && !!snapshot && !loading && !busy;
  const unavailable = !account ? 'Connect your wallet to trade.' : wrongChain ? `Switch to ${c.chain.name} to trade.` : !verified ? 'Deployment verification is required.' : loading ? 'Refreshing live state…' : !snapshot ? 'Refresh live state before trading.' : busy ? 'Wait for the current transaction.' : '';
  const symbol = snapshot?.symbol || (same(token, c.token.address) ? 'DESK' : 'TOKEN');
  const visible = snapshot?.orders.filter(o => same(o.token, token) && (tab === 'mine' ? same(o.maker, account) : tab === 'open' ? stateOf(o, now) === 'Open' : true)) || [];
  async function connect() {
    setActionError('');
    if (!window.ethereum) { setActionError('No browser wallet found. Open this page in an Ethereum wallet browser or install a browser wallet, then reload.'); return; }
    setConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as Address[];
      setAccount(accounts[0]);
      setChainId(Number(await window.ethereum.request({ method: 'eth_chainId' })));
    } catch (e) { setActionError(describeError(e)); } finally { setConnecting(false); }
  }
  async function switchNetwork() {
    if (!window.ethereum) return;
    setConnecting(true); setActionError('');
    try { await switchChain(window.ethereum, c.chain.id, c.deployment.walletAddChain); setChainId(Number(await window.ethereum.request({ method: 'eth_chainId' }))); }
    catch (e) { setActionError(describeError(e)); } finally { setConnecting(false); }
  }
  async function act(action: Action) {
    if (!ready || !account || !window.ethereum || lock.current) return;
    lock.current = true; setBusy(true); setActionError(''); setTxHash(undefined); setStatus('Preparing your transaction…');
    let submitted = false;
    try {
      await transact(c, window.ethereum, account, action, (message, hash) => { setStatus(message); if (hash) { submitted = true; setTxHash(hash); } });
      setStatus('Transaction confirmed. The board will update from the chain.'); setRefresh(v => v + 1);
    } catch (e) {
      setActionError(`${describeError(e)}${submitted ? ' A transaction was submitted; check its explorer status before retrying.' : ''}`); setStatus(''); setRefresh(v => v + 1);
    } finally { lock.current = false; setBusy(false); }
  }
  function changeToken(event: FormEvent) {
    event.preventDefault(); setTokenError('');
    try { const next = tokenAddress(tokenInput); setToken(next); setSnapshot(undefined); setSelected(undefined); setLimit(12); }
    catch (e) { setTokenError(describeError(e)); document.getElementById('token-address')?.focus(); }
  }
  return <>
    <a className="skip" href="#main">Skip to order book</a>
    <header className="topbar wrap">
      <a className="wordmark" href="#main" aria-label="Release Desk home">desk<span className="brand-dot">.</span></a>
      <div className="header-note">A direct way to trade.</div>
      <div className="wallet-tools"><span className="network-badge"><span aria-hidden="true" className="dot"/>{c.chain.name} testnet</span>
      {account ? <><span className="wallet-address" title={account}><AddressLink c={c} address={account}/></span><button className="quiet small" disabled={busy} onClick={() => { setAccount(undefined); setSelected(undefined); }}>Disconnect</button></> : <button className="primary" disabled={connecting} onClick={connect}>{connecting ? 'Connecting…' : 'Connect wallet'} <span aria-hidden="true">↗</span></button>}</div>
    </header>
    <main id="main" className="wrap" tabIndex={-1}>
      <section className="intro"><div><p className="eyebrow">Release Desk / Fixed-price market</p><h1>Your price.<br/><span>Your counterpart.</span></h1></div><div className="intro-copy"><p>Trade tokens for ETH, directly.<br/> Post your terms or take an open offer.<br/> Every order settles onchain.</p><span className="testnet-note">Test tokens. Real contract interactions.</span></div></section>
      {wrongChain && <div className="notice warning"><div><strong>Wallet is on a different network.</strong><p>This board runs on {c.chain.name}. Your wallet will offer to add it if needed.</p></div><button disabled={connecting || busy} onClick={switchNetwork}>Switch to {c.chain.name}</button></div>}
      <div className="status-strip"><div><span className={`dot ${verified ? 'success' : 'pending'}`} aria-hidden="true"/>{verified ? 'Deployment checked' : verificationError ? 'Verification unavailable' : 'Checking deployment…'}</div><span>{snapshot ? `Block ${snapshot.block.toLocaleString()}` : 'Waiting for live state'}</span><button className="quiet small" disabled={busy || (loading && verified)} onClick={() => { if (!verified) setVerificationTry(v => v + 1); setRefresh(v => v + 1); }}>{loading && verified ? 'Refreshing…' : 'Refresh state'} <span aria-hidden="true">↻</span></button></div>
      {verificationError && <p className="error-box" role="alert">{verificationError} Use Refresh state to retry.</p>}
      {readError && <p className="error-box" role="alert">Unable to read the board. {readError} Try Refresh state or select another token.</p>}
      <div className="transaction-status" role="status">{status}{txHash && <a href={`${c.deployment.network.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">View last transaction ↗</a>}</div>
      {actionError && <div className="error-box" role="alert">{actionError}<button className="quiet small" onClick={() => setActionError('')}>Dismiss message</button></div>}
      <div className="workspace">
        <section className="book" aria-labelledby="book-title">
          <div className="section-heading"><div><p className="eyebrow">01 / The market</p><h2 id="book-title">Order book <span className="count">{visible.length}</span></h2></div><a className="text-link" href="#post-order">Post an order <span aria-hidden="true">↗</span></a></div>
          <form className="token-filter" onSubmit={changeToken}>
            <label htmlFor="token-address">Token contract</label><div className="input-action"><input id="token-address" name="token" autoComplete="off" spellCheck={false} value={tokenInput} onChange={e => setTokenInput(e.target.value)} aria-invalid={!!tokenError} aria-describedby="token-hint" disabled={busy}/><button type="submit" disabled={busy}>Load token</button></div>
            <div id="token-hint" className={tokenError ? 'field-error' : 'hint'}>{tokenError || 'DESK by default. Paste any ERC-20 address to browse and post.'}</div>
            {!same(token, c.token.address) && <button className="quiet small" type="button" disabled={busy} onClick={() => { setToken(c.token.address); setTokenInput(c.token.address); setSnapshot(undefined); setSelected(undefined); setLimit(12); }}>Reset to DESK</button>}
          </form>
          <div className="book-toolbar"><div className="segmented" role="group" aria-label="Filter orders">{[['open','Open orders'],['mine','My orders'],['all','All statuses']].map(([key,label]) => <button key={key} aria-pressed={tab === key} disabled={key === 'mine' && !account} onClick={() => { setTab(key); setSelected(undefined); }}>{label}</button>)}</div><span className="pair-label">{symbol} / ETH</span></div>
          <div className="order-list" aria-busy={loading}>
            {(!verified || (!snapshot && !readError)) ? <div className="empty"><span className="empty-mark" aria-hidden="true">≋</span><h3>Reading the board</h3><p>Checking the deployment and fetching orders from {c.chain.name}.</p></div> : visible.length === 0 ? <div className="empty"><span className="empty-mark" aria-hidden="true">↗</span><h3>{readError ? 'The board is unavailable' : 'A clear desk. An open market.'}</h3><p>{readError ? 'Use Refresh state to try again.' : tab === 'mine' ? 'No orders from this wallet for this token in the loaded range.' : 'No matching orders in the loaded range. Set your terms and post the next offer.'}</p><a href="#post-order">Create an order <span aria-hidden="true">↗</span></a></div> : visible.map(order => <OrderRow key={order.id.toString()} c={c} order={order} account={account} now={now} symbol={symbol} expanded={selected === order.id} onSelect={() => setSelected(selected === order.id ? undefined : order.id)} ready={ready} unavailable={unavailable} act={act}/>)}
          </div>
          <div className="book-bottom"><span>{snapshot ? `${snapshot.loaded} of ${snapshot.count.toString()} total orders loaded, newest first. Filters apply to this range.` : 'Orders are read directly from the contract.'}</span>{snapshot && BigInt(snapshot.loaded) < snapshot.count && <button disabled={loading || busy} onClick={() => setLimit(v => v + 12)}>Load 12 older orders</button>}</div>
          <div className="principles"><div><span>01</span><strong>Set a fixed price</strong><p>You choose the ETH price per whole token.</p></div><div><span>02</span><strong>Trade any portion</strong><p>Buy part of an order at its posted price.</p></div><div><span>03</span><strong>Stay in control</strong><p>Cancel the remainder. Withdraw your proceeds.</p></div></div>
        </section>
        <aside className="side"><PostForm key={`${token}-${account || ''}`} c={c} token={token} snapshot={snapshot} symbol={symbol} ready={ready} unavailable={unavailable} busy={busy} act={act}/>
          <section className="proceeds" aria-labelledby="proceeds-title"><div><p className="eyebrow">Your settlement</p><h2 id="proceeds-title">ETH proceeds</h2></div><p className="proceeds-value">{account && snapshot ? formatEther(snapshot.credit) : '—'} <span>ETH</span></p><p className="hint">Filled orders credit your wallet here. Withdraw the full amount to your connected address.</p><button className="full" disabled={!ready || !snapshot || snapshot.credit === 0n} onClick={() => act({ kind: 'withdraw' })}>Withdraw ETH <span aria-hidden="true">↗</span></button>{!account && <p className="hint">Connect your wallet to see your proceeds.</p>}</section>
        </aside>
      </div>
      <section className="fineprint"><details><summary>Before you trade</summary><p>Orders escrow tokens in OTCBoard. Partial fills pay the fixed price, rounded up to the nearest wei. Gas is paid separately. Makers cannot buy their own orders. Cancel and repost to change your terms.</p><p>Fee-on-transfer tokens may escrow or deliver less than the amount entered. Rebasing tokens are unsupported. Anyone can create a token with a familiar name: verify its full contract address before approving or buying.</p><p>Expired orders can still be cancelled by their maker to recover the remaining tokens. This board has no protocol fee, owner, admin or upgrade controls.</p></details><details><summary>Contracts & deployment</summary><div className="contract-details">{c.deployment.contracts.map(contract => <div key={contract.name}><strong>{contract.name}</strong><AddressLink c={c} address={contract.address} label={contract.address}/></div>)}<div><strong>Selected token</strong><AddressLink c={c} address={token} label={token}/></div><div><strong>Source commit</strong><code>{c.deployment.sourceCommit}</code></div><a href="./imd-deployment.json">Deployment manifest ↗</a><p>Checks verify ABI hashes, RPC chain, deployed code presence and the featured token. They do not establish a token’s safety.</p></div></details></section>
    </main><footer className="wrap footer"><span>Release Desk <span className="muted">/ An open book.</span></span><span>{c.chain.name} · No protocol fee · Wallet to wallet</span></footer>
  </>;
}
function PostForm({ c, token, snapshot, symbol, ready, unavailable, busy, act }: { c: Config; token: Address; snapshot?: Snapshot; symbol: string; ready: boolean; unavailable: string; busy: boolean; act: (action: Action) => Promise<void> }) {
  const [quantity, setQuantity] = useState(''); const [price, setPrice] = useState(''); const [days, setDays] = useState('7');
  const [errors, setErrors] = useState<Record<string,string>>({});
  let required: bigint | undefined;
  try { required = amount(quantity, snapshot?.decimals ?? 18); } catch { /* Validated explicitly on action. */ }
  const approved = required !== undefined && !!snapshot && snapshot.allowance >= required;
  function validate(withPrice: boolean) {
    const next: Record<string,string> = {}; let value = 0n, cost = 0n;
    try { value = amount(quantity, snapshot!.decimals); if (value > snapshot!.balance) throw Error('This amount exceeds your token balance.'); } catch(e) { next['post-quantity'] = describeError(e); }
    if (withPrice) { try { cost = amount(price, 18); } catch(e) { next['post-price'] = describeError(e); } }
    setErrors(next);
    if (Object.keys(next).length) { document.getElementById(Object.keys(next)[0])?.focus(); return; }
    return { value, cost };
  }
  function approve() { if (!ready) return; const result = validate(false); if (result) void act({ kind: 'approve', token, amount: result.value }); }
  async function post(event: FormEvent) {
    event.preventDefault(); if (!ready || !approved || !snapshot) return;
    const result = validate(true); if (!result) return;
    // Use the last chain timestamp, not a visitor's potentially incorrect clock.
    await act({ kind: 'post', token, amount: result.value, price: result.cost, expiry: snapshot.time + BigInt(days) * 86400n });
  }
  return <section className="post-card" id="post-order" aria-labelledby="post-title"><p className="eyebrow">02 / Your terms</p><h2 id="post-title">Post an order</h2><p className="card-description">Sell {symbol} for ETH at your price.</p><form onSubmit={post} noValidate>
    <fieldset disabled={busy}><legend className="sr-only">Order terms</legend>
      <div className="field"><label htmlFor="post-quantity">Amount to sell <span>{symbol}</span></label><input id="post-quantity" name="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={quantity} onChange={e => { setQuantity(e.target.value); setErrors({}); }} aria-invalid={!!errors['post-quantity']} aria-describedby="quantity-help"/><div id="quantity-help" className={errors['post-quantity'] ? 'field-error' : 'hint'}>{errors['post-quantity'] || `Balance: ${snapshot && !unavailable.includes('Connect') ? units(snapshot.balance, snapshot.decimals) : '—'} ${symbol}`}</div></div>
      <div className="field"><label htmlFor="post-price">Price per whole token <span>ETH</span></label><input id="post-price" name="price" inputMode="decimal" autoComplete="off" placeholder="0.001" value={price} onChange={e => { setPrice(e.target.value); setErrors({}); }} aria-invalid={!!errors['post-price']} aria-describedby="price-help"/><div id="price-help" className={errors['post-price'] ? 'field-error' : 'hint'}>{errors['post-price'] || `ETH for 1 ${symbol}. Up to 18 decimal places.`}</div></div>
      <div className="field"><label htmlFor="post-expiry">Order duration</label><select id="post-expiry" name="duration" value={days} onChange={e => setDays(e.target.value)}><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="89">89 days</option></select></div>
      <div className="approval-note"><span className="step-number">1</span><p>Approve this amount for OTCBoard.<br/><span className="muted">Then escrow it by posting your order.</span></p></div>
      <button className="full" type="button" disabled={!ready || approved} onClick={approve}>{approved ? 'Amount approved ✓' : `Approve ${symbol}`}</button>
      {snapshot && snapshot.allowance > 0n && !approved && <button className="quiet full" type="button" disabled={!ready} onClick={() => act({ kind: 'approve', token, amount: 0n })}>Reset existing allowance to zero</button>}
      <button className="primary full post-button" type="submit" disabled={!ready || !approved}>Post order <span aria-hidden="true">↗</span></button>
    </fieldset>
    <p className="hint action-hint">{unavailable || (approved ? 'Review your terms above. Posting escrows your tokens until filled or cancelled.' : 'Approval and posting are separate wallet transactions. Gas is paid in ETH.')}</p>
  </form><p className="post-footnote">No protocol fee. Cancel unfilled tokens anytime.</p></section>;
}
function OrderRow({ c, order, account, now, symbol, expanded, onSelect, ready, unavailable, act }: { c: Config; order: Order; account?: Address; now: bigint; symbol: string; expanded: boolean; onSelect: () => void; ready: boolean; unavailable: string; act: (action: Action) => Promise<void> }) {
  const [quantity, setQuantity] = useState(''); const [quote, setQuote] = useState<{ amount: bigint; cost: bigint }>(); const [error, setError] = useState(''); const [quoting, setQuoting] = useState(false); const [confirmCancel, setConfirmCancel] = useState(false);
  const quoteGeneration = useRef(0);
  const state = stateOf(order, now);
  useEffect(() => { quoteGeneration.current++; setQuote(undefined); setError(''); setConfirmCancel(false); }, [account, expanded, order.remaining]);
  async function getQuote(event: FormEvent) {
    event.preventDefault(); setError(''); setQuote(undefined);
    const generation = ++quoteGeneration.current;
    try {
      const value = amount(quantity, order.decimals);
      if (value > order.remaining) throw Error('Enter an amount within the remaining order size.');
      setQuoting(true);
      const cost = await c.client.readContract({ address: c.board.address, abi: c.board.abi, functionName: 'quote', args: [order.id, value] }) as bigint;
      if (generation === quoteGeneration.current) setQuote({ amount: value, cost });
    } catch (e) { if (generation === quoteGeneration.current) { setError(describeError(e)); document.getElementById(`fill-${order.id}`)?.focus(); } }
    finally { setQuoting(false); }
  }
  return <article className={`order ${expanded ? 'expanded' : ''}`}>
    <div className="order-summary"><div><span className="order-id">Order #{order.id.toString()} <span className={`order-state ${state === 'Open' ? 'open' : ''}`}>{state}</span></span><strong className="order-amount">{units(order.remaining, order.decimals)} <span>{symbol}</span></strong><span className="hint">Maker <AddressLink c={c} address={order.maker}/>{same(order.maker, account) ? ' · You' : ''}</span></div><div className="order-price"><strong>{formatEther(order.pricePerToken)} ETH</strong><span className="hint">per {symbol}</span><button className="small" onClick={onSelect} aria-expanded={expanded} aria-controls={`order-${order.id}`}>{expanded ? 'Close details' : same(order.maker, account) ? 'Manage order' : 'View order'} <span aria-hidden="true">{expanded ? '−' : '↗'}</span></button></div></div>
    {expanded && <div className="order-detail" id={`order-${order.id}`}><p className="hint">Expires {new Date(Number(order.expiry) * 1000).toLocaleString()} · {order.decimals} token decimals recorded at posting.</p><p className="hint">Token: <AddressLink c={c} address={order.token} label={order.token}/></p>
      {canCancel(order, account) ? <div><p>Cancel to return the unfilled {units(order.remaining, order.decimals)} {symbol} to your wallet.</p>{confirmCancel ? <div className="button-row"><button disabled={!ready} onClick={() => { setConfirmCancel(false); void act({ kind: 'cancel', id: order.id }); }}>Confirm cancellation</button><button className="quiet" onClick={() => setConfirmCancel(false)}>Keep order</button></div> : <button disabled={!ready} onClick={() => setConfirmCancel(true)}>Cancel order</button>}</div> : state === 'Open' && !same(order.maker, account) ? <form onSubmit={getQuote} noValidate><div className="field"><label htmlFor={`fill-${order.id}`}>Amount to buy ({symbol})</label><div className="input-action"><input id={`fill-${order.id}`} name="fillAmount" inputMode="decimal" autoComplete="off" value={quantity} placeholder="0.00" onChange={e => { setQuantity(e.target.value); setQuote(undefined); setError(''); quoteGeneration.current++; }} aria-invalid={!!error} aria-describedby={`quote-info-${order.id}`}/><button type="submit" disabled={!ready || quoting}>{quoting ? 'Quoting…' : 'Get exact quote'}</button></div></div><div id={`quote-info-${order.id}`} className={error ? 'field-error' : 'hint'} role={error ? 'alert' : undefined}>{error || 'The ETH cost rounds up to the nearest wei. Gas is additional.'}</div>{quote && <div className="quote"><span>You pay exactly</span><strong>{formatEther(quote.cost)} ETH</strong><span>{quote.cost.toString()} wei · for {units(quote.amount, order.decimals)} {symbol}</span><button type="button" disabled={!ready || !canFill(order, account, now)} onClick={() => act({ kind: 'fill', id: order.id, amount: quote.amount, cost: quote.cost })}>Buy for {formatEther(quote.cost)} ETH</button></div>}</form> : <p>This order is {state.toLowerCase()}. {same(order.maker, account) && state === 'Open' ? 'Makers cannot fill their own orders.' : 'Choose an open order to trade.'}</p>}
      {unavailable && <p className="hint">{unavailable}</p>}
    </div>}
  </article>;
}
