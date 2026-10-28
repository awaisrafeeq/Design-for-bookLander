'use client';
import { useCallback, useEffect, useState, type PointerEvent } from 'react';
import { studioApi, type SpendReport } from '../api';
import { Header, Icon, money } from '../components/Design';

type UsageUnit = 'usd' | 'credits';
type ChartMode = 'daily' | 'cumulative';
const usageMoney=(value:number)=>value>0&&value<.01?`$${value.toFixed(4)}`:money(value);
const sum=(values:number[])=>values.reduce((total,value)=>total+value,0);

function UsageChart({dates,values,unit}:{dates:string[];values:number[];unit:UsageUnit}) {
  const [mode,setMode]=useState<ChartMode>('daily');
  const [hoverIndex,setHoverIndex]=useState<number|null>(null);
  const [selectedIndex,setSelectedIndex]=useState<number|null>(null);
  const width=900,height=220,left=56,right=16,top=18,bottom=34;
  const plotHeight=height-top-bottom;
  const chartValues=mode==='daily'?values:values.map((_,index)=>sum(values.slice(0,index+1)));
  const max=Math.max(unit==='usd'?.001:1,...chartValues)*1.12;
  const slot=(width-left-right)/Math.max(1,values.length);
  const labelEvery=values.length<=7?1:values.length<=30?5:15;
  const safeSelectedIndex=selectedIndex!=null&&selectedIndex<values.length?selectedIndex:null;
  const activeIndex=hoverIndex!=null&&hoverIndex<values.length?hoverIndex:safeSelectedIndex;
  const activeValue=activeIndex==null?null:chartValues[activeIndex];
  const activeDate=activeIndex==null?null:dates[activeIndex];
  const dateLabel=(value:string)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));
  const pointLabel=(value:number)=>unit==='usd'?usageMoney(value):`${Number(value.toFixed(1)).toLocaleString()} credits`;
  const pointerIndex=(event:PointerEvent<SVGSVGElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    const x=(event.clientX-rect.left)/rect.width*width;
    return Math.max(0,Math.min(values.length-1,Math.floor((x-left)/slot)));
  };
  const activeX=activeIndex==null?null:left+slot*activeIndex+slot/2;
  const peak=Math.max(...values,0);
  const peakIndex=values.indexOf(peak);
  const peakDate=peakIndex>=0?dates[peakIndex]:'';
  return <div className="ai-chart-shell">
    <div className="ai-chart-toolbar">
      <div className="ai-chart-context"><strong>{mode==='daily'?'Daily activity':'Cumulative total'}</strong><span>{activeDate?`${dateLabel(activeDate)} · ${pointLabel(activeValue??0)}`:`Peak day ${peakDate?dateLabel(peakDate):'—'} · ${pointLabel(peak)}`}</span></div>
      <div className="ai-chart-mode" role="group" aria-label="Chart view">
        <button className={mode==='daily'?'active':''} onClick={()=>setMode('daily')} aria-pressed={mode==='daily'}>Daily</button>
        <button className={mode==='cumulative'?'active':''} onClick={()=>setMode('cumulative')} aria-pressed={mode==='cumulative'}>Cumulative</button>
      </div>
    </div>
    <svg className="ai-usage-chart" viewBox={`0 0 ${width} ${height}`} role="application" tabIndex={0}
      aria-label={`${mode==='daily'?'Daily':'Cumulative'} ${unit} usage from ${dates[0]} to ${dates.at(-1)}. Hover or use arrow keys to inspect values.`}
      onPointerMove={event=>{if(values.length)setHoverIndex(pointerIndex(event));}}
      onPointerLeave={()=>setHoverIndex(null)}
      onClick={event=>{if(values.length)setSelectedIndex(pointerIndex(event));}}
      onKeyDown={event=>{
        if(!values.length)return;
        if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
          event.preventDefault();
          const current=selectedIndex??0;
          setSelectedIndex(Math.max(0,Math.min(values.length-1,current+(event.key==='ArrowRight'?1:-1))));
          setHoverIndex(null);
        }else if(event.key==='Escape'){setSelectedIndex(null);setHoverIndex(null);}
      }}>
      {[0,.5,1].map(fraction=>{const y=top+plotHeight*(1-fraction);const tick=max*fraction;return <g key={fraction}><line x1={left} x2={width-right} y1={y} y2={y} className="ai-chart-grid"/><text x={left-10} y={y+4} textAnchor="end" className="ai-chart-label">{unit==='usd'?usageMoney(tick):Math.round(tick).toLocaleString()}</text></g>;})}
      {activeX!=null&&<line x1={activeX} x2={activeX} y1={top} y2={top+plotHeight} className="ai-chart-crosshair"/>}
      {chartValues.map((value,index)=>{const barHeight=value>0?Math.max(2,value/max*plotHeight):0;const x=left+slot*index+slot*.2;return <g key={dates[index]}><rect x={x} y={top+plotHeight-barHeight} width={Math.max(1,slot*.6)} height={barHeight} rx="3" className={`ai-chart-bar${activeIndex===index?' is-active':''}`}><title>{`${dateLabel(dates[index])}: ${pointLabel(value)}`}</title></rect>{(index%labelEvery===0||index===values.length-1)&&<text x={x+slot*.3} y={height-9} textAnchor="middle" className="ai-chart-label">{dates[index]?.slice(5)}</text>}</g>;})}
    </svg>
    <div className="ai-chart-hint" aria-live="polite">{safeSelectedIndex!=null?`Pinned: ${dateLabel(dates[safeSelectedIndex])} · ${pointLabel(chartValues[safeSelectedIndex])}. Press Escape to clear.`:'Hover over the chart, click a day to pin it, or focus the chart and use ← / →.'}</div>
  </div>;
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
  const predisHistoryAvailable=predis?.historyStatus==='ok';
  const predisDaily=(predisHistoryAvailable?predis?.dailyAccountCredits:predis?.dailyEstimatedCredits)?.slice(-range)||[];
  const predisUsageTotal=sum(predisDaily);
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
        <div><span>Predis credits used</span><strong>{predisUsageTotal>0?Number(predisUsageTotal.toFixed(1)).toLocaleString():'—'}</strong><small>{predisHistoryAvailable?'Reported by Predis runs': 'Estimated · 15 credits per image or slide'}</small></div>
        <div><span>Creatify credits</span><strong>{sum(creatifyDaily)>0?Number(sum(creatifyDaily).toFixed(1)):'—'}</strong><small>Reported by completed jobs</small></div>
      </div>
      <section className="card pad ai-provider-card ai-provider-featured"><Header title="OpenRouter"><span className="pill ai r">USD</span></Header><div className="ai-provider-stats"><Metric label="BookLender spend" value={usageMoney(sum(routerDaily))} note={`Recorded in the last ${range} days`}/><Metric label={`Remaining ${router!.balanceScope||'key limit'}`} value={router!.remainingUsd==null?'—':money(router!.remainingUsd)} note={router!.remainingUsd==null?router!.status==='not_configured'?'API key is not configured':'Live balance unavailable or this key has no limit':router!.balanceScope==='account'?'Live OpenRouter account balance':'Live OpenRouter key spending limit'}/></div><UsageChart dates={dates} values={routerDaily} unit="usd"/><p className="ai-chart-note">BookLender request costs by Eastern date. OpenRouter account usage uses UTC and can include other apps.</p></section>
      <div className="ai-spend-grid">
        <section className="card pad ai-provider-card"><Header title="Predis"><span className="pill ai r">Credits</span></Header><div className="ai-provider-stats"><Metric label={predisHistoryAvailable?'Credits used · Predis-reported':'Estimated credits used'} value={predisUsageTotal>0?Number(predisUsageTotal.toFixed(1)).toLocaleString():'—'} note={predisHistoryAvailable?`Exact charges found in available Predis runs · ${range} days`:predis!.estimatedCredits>0?`Estimate · 15 credits per generated image/slide · ${range} days`:predis!.historyStatus==='history_tool_unavailable'?'Predis MCP does not expose run credit history':'No recoverable media charges in this period'}/><Metric label="Actual account credits left" value={predis!.balanceStatus==='ok'&&predis!.remainingCredits!=null?Number(predis!.remainingCredits).toLocaleString():'—'} note={predis!.balanceStatus==='ok'?'Live from your Predis account':predis!.balanceStatus==='not_connected'?'Connect your Predis account to read its live balance':predis!.balanceStatus==='balance_tool_unavailable'?'Connected, but no readable account-balance tool was found. Refresh after the update.':predis!.balanceStatus==='balance_value_unrecognized'?'Predis account tool responded, but its credit field is not recognized yet.':'Predis balance is unavailable. Refresh or reconnect if sign-in expired.'}/></div>{predis!.canConnect&&['not_connected','reconnect_required'].includes(predis!.balanceStatus)&&<button className="btn ghost sm" onClick={()=>void connectPredis()} disabled={connecting}>{connecting?'Connecting…':predis!.balanceStatus==='not_connected'?'Connect Predis account':'Reconnect Predis account'}</button>}<UsageChart dates={dates} values={predisDaily} unit="credits"/><p className="ai-chart-note">{predisHistoryAvailable?'Bars show explicit credit charges from Predis run history returned to BookLender.':'Bars estimate BookLender generations at 15 credits per generated image or carousel slide.'} Current balance is read separately from Predis account information.</p></section>
        <section className="card pad ai-provider-card"><Header title="Creatify"><span className="pill ai r">Credits</span></Header><div className="ai-provider-stats"><Metric label="Credits used" value={sum(creatifyDaily)>0?Number(sum(creatifyDaily).toFixed(1)).toLocaleString():'—'} note={`Provider-reported usage · last ${range} days`}/><Metric label="Remaining credits" value={creatify!.remainingCredits==null?'—':Number(creatify!.remainingCredits).toLocaleString()} note={creatify!.balanceStatus==='ok'?'Live from Creatify Workspace API':creatify!.balanceStatus==='not_configured'?'Creatify API credentials are not configured':'Creatify balance is temporarily unavailable'}/></div><UsageChart dates={dates} values={creatifyDaily} unit="credits"/><p className="ai-chart-note">Daily credits reported by Creatify jobs; remaining balance is fetched from the Workspace API.</p></section>
      </div>
      <p className="ai-spend-footnote">When Predis exposes per-run credit charges, the chart uses those reported values; otherwise it shows BookLender's estimate. Account balance is live when Predis returns it. Currency and provider credits are shown separately.</p>
    </>}
  </div>;
}
