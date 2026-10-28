'use client';
import { useCallback, useEffect, useState } from 'react';
import { studioApi, type SpendReport } from '../api';
import { Header, Icon, money } from '../components/Design';

type UsageUnit = 'usd' | 'credits';
const usageMoney=(value:number)=>value>0&&value<.01?`$${value.toFixed(4)}`:money(value);
const sum=(values:number[])=>values.reduce((total,value)=>total+value,0);

function UsageChart({dates,values,unit}:{dates:string[];values:number[];unit:UsageUnit}) {
  const width=900,height=220,left=56,right=16,top=18,bottom=34;
  const plotHeight=height-top-bottom;
  const max=Math.max(unit==='usd'?.001:1,...values)*1.12;
  const slot=(width-left-right)/Math.max(1,values.length);
  const labelEvery=values.length<=7?1:values.length<=30?5:15;
  return <svg className="ai-usage-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Daily ${unit} usage from ${dates[0]} to ${dates.at(-1)}`}>
    {[0,.5,1].map(fraction=>{const y=top+plotHeight*(1-fraction);return <g key={fraction}><line x1={left} x2={width-right} y1={y} y2={y} className="ai-chart-grid"/><text x={left-10} y={y+4} textAnchor="end" className="ai-chart-label">{unit==='usd'?`$${(max*fraction).toFixed(max<.1?4:2)}${fraction===1?'':' '}`:Math.round(max*fraction)}</text></g>;})}
    {values.map((value,index)=>{const barHeight=value>0?Math.max(2,value/max*plotHeight):0;const x=left+slot*index+slot*.2;return <g key={dates[index]}><rect x={x} y={top+plotHeight-barHeight} width={Math.max(1,slot*.6)} height={barHeight} rx="3" className="ai-chart-bar"><title>{`${dates[index]}: ${unit==='usd'?usageMoney(value):`${Number(value.toFixed(1))} credits`}`}</title></rect>{(index%labelEvery===0||index===values.length-1)&&<text x={x+slot*.3} y={height-9} textAnchor="middle" className="ai-chart-label">{dates[index]?.slice(5)}</text>}</g>;})}
  </svg>;
}

function Metric({label,value,note}:{label:string;value:string;note:string}) {
  return <div className="ai-provider-metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

export default function SpendPage() {
  const [report,setReport]=useState<SpendReport|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [range,setRange]=useState<7|30|90>(30);
  const [connecting,setConnecting]=useState(false);
  const [connectionMessage,setConnectionMessage]=useState('');
  const load=useCallback(async()=>{setLoading(true);setError('');try{setReport(await studioApi.spendReport());}catch(cause){setError((cause as Error).message);}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{const result=new URLSearchParams(window.location.search).get('predis');if(result==='failed')setConnectionMessage('Predis sign-in did not complete. Please connect again.');else if(result==='cancelled')setConnectionMessage('Predis sign-in was cancelled.');else if(result==='connected')setConnectionMessage('Predis account connected. Reading the live credit balance…');},[]);
  const connectPredis=async()=>{
    setConnecting(true);setConnectionMessage('');
    try{
      const csrfResponse=await fetch('/api/auth/csrf',{cache:'no-store'});
      const csrf=await csrfResponse.json() as {csrf_token?:string};
      if(!csrfResponse.ok||!csrf.csrf_token)throw new Error('Your session expired. Sign in again.');
      const response=await fetch('/api/v1/predis/connect',{method:'POST',headers:{'X-CSRF-Token':csrf.csrf_token}});
      const data=await response.json() as {authorizationUrl?:string;detail?:string};
      if(!response.ok||!data.authorizationUrl)throw new Error(data.detail||'Could not connect Predis');
      window.location.assign(data.authorizationUrl);
    }catch(cause){setConnectionMessage((cause as Error).message);setConnecting(false);}
  };
  const dates=report?.days.slice(-range)||[];
  const router=report?.providers.OpenRouter;
  const predis=report?.providers.Predis;
  const creatify=report?.providers.Creatify;
  const routerDaily=router?.daily.slice(-range)||[];
  const predisDaily=predis?.dailyEstimatedCredits.slice(-range)||[];
  const creatifyDaily=creatify?.dailyCredits.slice(-range)||[];
  return <div className="ai-spend-page">
    <div className="ai-spend-heading"><div><p className="ai-eyebrow">PROVIDER COSTS</p><h2>AI usage</h2><p className="muted">Spend and credits used by BookLender generations. Balances are live where the provider API supports them.</p></div><div className="ai-spend-actions"><div className="ai-spend-range" aria-label="Usage period">{([7,30,90] as const).map(days=><button key={days} className={`fchip ${range===days?'on':''}`} onClick={()=>setRange(days)}>{days} days</button>)}</div><button className="btn ghost sm" onClick={()=>void load()} disabled={loading}><Icon name="retry"/>{loading?'Refreshing…':'Refresh'}</button></div></div>
    {error&&<section className="card pad" role="alert">{error} <button className="btn sm ghost" onClick={()=>void load()}>Retry</button></section>}
    {connectionMessage&&<section className="card pad" role="status">{connectionMessage}</section>}
    {!report&&loading&&<section className="card pad" role="status">Loading provider usage…</section>}
    {report&&<>
      <div className="ai-usage-summary" aria-label={`Summary for the last ${range} days`}>
        <div><span>OpenRouter spend</span><strong>{usageMoney(sum(routerDaily))}</strong><small>USD · BookLender requests</small></div>
        <div><span>OpenRouter remaining</span><strong>{router!.remainingUsd==null?'—':money(router!.remainingUsd)}</strong><small>{router!.balanceScope==='account'?'Live account balance':router!.balanceScope==='key limit'?'Live key limit':'No live balance returned'}</small></div>
        <div><span>Predis credits</span><strong>{sum(predisDaily)>0?Number(sum(predisDaily).toFixed(1)):'—'}</strong><small>Estimated · 15 credits per image or slide</small></div>
        <div><span>Creatify credits</span><strong>{sum(creatifyDaily)>0?Number(sum(creatifyDaily).toFixed(1)):'—'}</strong><small>Reported by completed jobs</small></div>
      </div>
      <section className="card pad ai-provider-card ai-provider-featured"><Header title="OpenRouter"><span className="pill ai r">USD</span></Header><div className="ai-provider-stats"><Metric label="BookLender spend" value={usageMoney(sum(routerDaily))} note={`Recorded in the last ${range} days`}/><Metric label={`Remaining ${router!.balanceScope||'key limit'}`} value={router!.remainingUsd==null?'—':money(router!.remainingUsd)} note={router!.remainingUsd==null?router!.status==='not_configured'?'API key is not configured':'Live balance unavailable or this key has no limit':router!.balanceScope==='account'?'Live OpenRouter account balance':'Live OpenRouter key spending limit'}/></div><UsageChart dates={dates} values={routerDaily} unit="usd"/><p className="ai-chart-note">BookLender request costs by Eastern date. OpenRouter account usage uses UTC and can include other apps.</p></section>
      <div className="ai-spend-grid">
        <section className="card pad ai-provider-card"><Header title="Predis"><span className="pill ai r">Credits</span></Header><div className="ai-provider-stats"><Metric label="Estimated credits used" value={sum(predisDaily)>0?Number(sum(predisDaily).toFixed(1)).toLocaleString():'—'} note={sum(predisDaily)>0?`Estimated from generated images/slides · ${range} days`:'No recoverable media charges in this period'}/><Metric label="Actual account credits left" value={predis!.balanceStatus==='ok'&&predis!.remainingCredits!=null?Number(predis!.remainingCredits).toLocaleString():'—'} note={predis!.balanceStatus==='ok'?'Live from your Predis account':predis!.balanceStatus==='not_connected'?'Connect your Predis account to read its live balance':predis!.balanceStatus==='balance_tool_unavailable'?'Connected, but Predis did not expose a readable balance tool':'Predis balance is unavailable. Reconnect or refresh.'}/></div>{predis!.canConnect&&predis!.balanceStatus!=='ok'&&<button className="btn ghost sm" onClick={()=>void connectPredis()} disabled={connecting}>{connecting?'Connecting…':predis!.balanceStatus==='not_connected'?'Connect Predis account':'Reconnect Predis account'}</button>}<UsageChart dates={dates} values={predisDaily} unit="credits"/><p className="ai-chart-note">Used credits are estimated at 15 per generated image or carousel slide. The account balance comes from Predis after sign-in and includes activity outside BookLender.</p></section>
        <section className="card pad ai-provider-card"><Header title="Creatify"><span className="pill ai r">Credits</span></Header><div className="ai-provider-stats"><Metric label="Credits used" value={sum(creatifyDaily)>0?Number(sum(creatifyDaily).toFixed(1)).toLocaleString():'—'} note={`Provider-reported usage · last ${range} days`}/><Metric label="Remaining credits" value={creatify!.remainingCredits==null?'—':Number(creatify!.remainingCredits).toLocaleString()} note={creatify!.balanceStatus==='ok'?'Live from Creatify Workspace API':creatify!.balanceStatus==='not_configured'?'Creatify API credentials are not configured':'Creatify balance is temporarily unavailable'}/></div><UsageChart dates={dates} values={creatifyDaily} unit="credits"/><p className="ai-chart-note">Daily credits reported by Creatify jobs; remaining balance is fetched from the Workspace API.</p></section>
      </div>
      <p className="ai-spend-footnote">Predis estimates cover BookLender jobs with a saved media count. Predis account activity outside BookLender is not included. Currency and provider credits are shown separately.</p>
    </>}
  </div>;
}
