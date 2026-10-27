'use client';
import { useCallback, useEffect, useState } from 'react';
import { studioApi, type SpendReport } from '../api';
import { Header, Icon, money } from '../components/Design';

const usageMoney=(value:number)=>value>0&&value<.01?`$${value.toFixed(4)}`:money(value);

function formatValue(value:number, unit:'usd'|'credits'|'jobs') {
  return unit==='usd' ? usageMoney(value) : `${Number(value.toFixed(2))}${unit==='jobs'?' jobs':' credits'}`;
}

function UsageChart({dates,values,unit}:{dates:string[];values:number[];unit:'usd'|'credits'|'jobs'}) {
  const width=720,height=205,left=44,right=14,top=16,bottom=34;
  const plotHeight=height-top-bottom;
  const max=Math.max(unit==='usd'?.001:1,...values)*1.12;
  const slot=(width-left-right)/Math.max(1,values.length);
  return <svg className="ai-usage-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Daily ${unit} usage from ${dates[0]} to ${dates.at(-1)}`}>
    {[0,.5,1].map(fraction=>{const y=top+plotHeight*(1-fraction);return <g key={fraction}><line x1={left} x2={width-right} y1={y} y2={y} className="ai-chart-grid"/><text x={left-6} y={y+4} textAnchor="end" className="ai-chart-label">{unit==='usd'?`$${(max*fraction).toFixed(max<.1?4:2)}`:Math.round(max*fraction)}</text></g>})}
    {values.map((value,index)=>{const barHeight=value/max*plotHeight;const x=left+slot*index+slot*.18;return <g key={dates[index]}><rect x={x} y={top+plotHeight-barHeight} width={slot*.64} height={barHeight} rx="3" className="ai-chart-bar"><title>{`${dates[index]}: ${formatValue(value,unit)}`}</title></rect>{(values.length<=7||index%5===0||index===values.length-1)&&<text x={x+slot*.32} y={height-10} textAnchor="middle" className="ai-chart-label">{dates[index]?.slice(5)}</text>}</g>})}
  </svg>;
}

export default function SpendPage() {
  const [report,setReport]=useState<SpendReport|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [range,setRange]=useState<7|30>(7);
  const load=useCallback(async()=>{setLoading(true);setError('');try{setReport(await studioApi.spendReport());}catch(cause){setError((cause as Error).message);}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const dates=report?.days.slice(-range)||[];
  const router=report?.providers.OpenRouter;
  const predis=report?.providers.Predis;
  const creatify=report?.providers.Creatify;
  return <div className="ai-spend-page">
    <div className="ai-spend-heading"><div><h2>AI usage</h2><p className="muted">OpenRouter is measured in USD. Predis and Creatify use their own credits. Dates use Eastern Time.</p></div><button className="btn ghost sm" onClick={()=>void load()} disabled={loading}><Icon name="retry"/>{loading?'Refreshing…':'Refresh usage'}</button></div>
    {error&&<section className="card pad" role="alert">{error} <button className="btn sm ghost" onClick={()=>void load()}>Retry</button></section>}
    {!report&&loading&&<section className="card pad" role="status">Loading provider usage…</section>}
    {report&&<>
      <div className="ai-spend-range" aria-label="Usage period"><span className="muted">Recorded usage</span><div>{([7,30] as const).map(days=><button key={days} className={`fchip ${range===days?'on':''}`} onClick={()=>setRange(days)}>{days} days</button>)}</div></div>
      <div className="ai-spend-grid">
        <section className="card pad ai-provider-card"><Header title="OpenRouter"><span className="pill ai r">USD</span></Header><div className="ai-provider-stats"><div><span>Recorded in BookLender</span><strong>{usageMoney(router!.daily.slice(-range).reduce((sum,n)=>sum+n,0))}</strong><small>Last {range} days</small></div><div><span>Remaining {router!.balanceScope||'balance'}</span><strong>{router!.remainingUsd==null?'—':money(router!.remainingUsd)}</strong><small>{router!.remainingUsd==null?router!.status==='not_configured'?'OpenRouter API key is not configured.':'Account balance requires an OpenRouter management key; an uncapped key has no limit remaining.':router!.balanceScope==='account'?'Live account credits':'Live API key limit, not account balance'}</small></div></div><UsageChart dates={dates} values={router!.daily.slice(-range)} unit="usd"/><p className="small muted">Daily bars show provider costs recorded for BookLender requests. OpenRouter&apos;s live key usage uses its own UTC day and may include other apps.</p>{router!.status==='unavailable'&&<p className="small ai-data-note">Live balance is temporarily unavailable; recorded spending is still shown.</p>}</section>
        {([['Predis',predis],['Creatify',creatify]] as const).map(([name,provider])=>{if(!provider)return null;const hasCredits=provider.creditReports>0;const chartValues=hasCredits?provider.dailyCredits.slice(-range):provider.daily.slice(-range);return <section className="card pad ai-provider-card" key={name}><Header title={name}><span className="pill ai r">Credits</span></Header><div className="ai-provider-stats"><div><span>Credits reported by jobs</span><strong>{hasCredits?Number(provider.credits.toFixed(2)):'—'}</strong><small>{hasCredits?`${provider.creditReports} jobs reported credits in 30 days`:provider.jobs?'Provider did not return credit use for these jobs':'No generation jobs recorded in 30 days'}</small></div><div><span>Remaining credits</span><strong>—</strong><small>No verified balance API available. Check your {name} account.</small></div></div><UsageChart dates={dates} values={chartValues} unit={hasCredits?'credits':'jobs'}/><p className="small muted">{hasCredits?'Daily credits reported in provider job responses.':'Daily completed BookLender generations; this is a job count, not a credit estimate.'} {provider.jobs} completed jobs in the last 30 days.</p></section>;})}
      </div>
      <p className="small muted ai-spend-footnote">This page shows usage recorded by BookLender. It does not combine USD and credits or infer a provider balance from a subscription plan. Earlier jobs without credit data remain unreported.</p>
    </>}
  </div>;
}
