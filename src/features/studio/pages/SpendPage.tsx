'use client';
import { useCallback, useEffect, useState } from 'react';
import { studioApi, type SpendReport } from '../api';
import { Header, Icon, money } from '../components/Design';

type UsageUnit = 'usd' | 'credits';
const usageMoney=(value:number)=>value>0&&value<.01?`$${value.toFixed(4)}`:money(value);
const sum=(values:number[])=>values.reduce((total,value)=>total+value,0);

function dateLabel(value:string, options:Intl.DateTimeFormatOptions={month:'short',day:'numeric',year:'numeric'}) {
  return new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));
}
function metricLabel(value:number,unit:UsageUnit) {
  return unit==='usd'?usageMoney(value):`${Number(value.toFixed(1)).toLocaleString()} credits`;
}

function LineUsageChart({dates,values}:{dates:string[];values:number[]}) {
  const [hoverIndex,setHoverIndex]=useState<number|null>(null);
  const [selectedIndex,setSelectedIndex]=useState<number|null>(null);
  const width=900,height=220,left=56,right=16,top=18,bottom=34;
  const plotHeight=height-top-bottom;
  const max=Math.max(.001,...values)*1.18;
  const slot=(width-left-right)/Math.max(1,values.length);
  const labelEvery=values.length<=7?1:values.length<=30?5:15;
  const safeSelectedIndex=selectedIndex!=null&&selectedIndex<values.length?selectedIndex:null;
  const activeIndex=hoverIndex!=null&&hoverIndex<values.length?hoverIndex:safeSelectedIndex;
  const activeValue=activeIndex==null?null:values[activeIndex];
  const activeDate=activeIndex==null?null:dates[activeIndex];
  const pointLabel=(value:number)=>metricLabel(value,'usd');
  const pointerIndex=(clientX:number,svg:SVGSVGElement)=>{
    const rect=svg.getBoundingClientRect();
    const x=(clientX-rect.left)/rect.width*width;
    return Math.max(0,Math.min(values.length-1,Math.floor((x-left)/slot)));
  };
  const xAt=(index:number)=>left+slot*index+slot/2;
  const yAt=(value:number)=>top+plotHeight-(value/max*plotHeight);
  const activeX=activeIndex==null?null:xAt(activeIndex);
  const linePoints=values.map((value,index)=>`${xAt(index)},${yAt(value)}`).join(' ');
  const lastDate=dates.at(-1)||'';
  return <div className="ai-chart-shell">
    <div className="ai-chart-toolbar">
      <div className="ai-chart-context"><strong>Daily spend</strong><span>{activeDate?`${dateLabel(activeDate)} · ${pointLabel(activeValue??0)}`:`${dates.length} days · ${dateLabel(dates[0]||lastDate,{month:'short',day:'numeric'})} – ${dateLabel(lastDate,{month:'short',day:'numeric'})}`}</span></div>
    </div>
    <svg className="ai-usage-chart" viewBox={`0 0 ${width} ${height}`} role="application" tabIndex={0}
      aria-label={`Daily OpenRouter spend in US dollars from ${dates[0]} to ${lastDate}. Hover or use arrow keys to inspect values.`}
      onPointerMove={event=>{if(values.length)setHoverIndex(pointerIndex(event.clientX,event.currentTarget));}}
      onPointerLeave={()=>setHoverIndex(null)}
      onClick={event=>{if(values.length)setSelectedIndex(pointerIndex(event.clientX,event.currentTarget));}}
      onKeyDown={event=>{
        if(!values.length)return;
        if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
          event.preventDefault();
          const current=selectedIndex??0;
          setSelectedIndex(Math.max(0,Math.min(values.length-1,current+(event.key==='ArrowRight'?1:-1))));
          setHoverIndex(null);
        }else if(event.key==='Escape'){setSelectedIndex(null);setHoverIndex(null);}
      }}>
      {[0,.5,1].map(fraction=>{const y=top+plotHeight*(1-fraction);const tick=max*fraction;return <g key={fraction}><line x1={left} x2={width-right} y1={y} y2={y} className="ai-chart-grid"/><text x={left-10} y={y+4} textAnchor="end" className="ai-chart-label">{usageMoney(tick)}</text></g>;})}
      {activeX!=null&&<line x1={activeX} x2={activeX} y1={top} y2={top+plotHeight} className="ai-chart-crosshair"/>}
      <polyline points={linePoints} className="ai-chart-line"/>
      {values.map((value,index)=>{const x=xAt(index),y=yAt(value);return <g key={dates[index]} className="ai-chart-point" onPointerEnter={()=>setHoverIndex(index)}><circle cx={x} cy={y} r={activeIndex===index?5:2.5} className={`ai-chart-dot${activeIndex===index?' is-active':''}`}/><title>{`${dateLabel(dates[index])}: ${pointLabel(value)}`}</title>{(index%labelEvery===0||index===values.length-1)&&<text x={x} y={height-9} textAnchor="middle" className="ai-chart-label">{dates[index]?.slice(5)}</text>}</g>;})}
    </svg>
    <div className="ai-chart-hint" aria-live="polite">{safeSelectedIndex!=null?`Pinned: ${dateLabel(dates[safeSelectedIndex])} · ${pointLabel(values[safeSelectedIndex])}. Press Escape to clear.`:'Hover over the line or a point for the exact daily spend. Click to pin a day; use ← / → when focused.'}</div>
  </div>;
}

function PredisCalendarChart({dates,values}:{dates:string[];values:number[]}) {
  const [active,setActive]=useState<number|null>(null);
  const days=dates.map((date,index)=>({date,value:values[index]||0,weekday:new Date(`${date}T00:00:00Z`).getUTCDay(),index}));
  const offset=days[0]?.weekday||0;
  const cells=[...Array(offset).fill(null),...days];
  const columns=7,rows=Math.ceil(cells.length/columns),cell=34,gap=5;
  const max=Math.max(1,...values);
  const activeDay=active==null?null:days[active];
  const color=(value:number)=>value<=0?'var(--sunk)':`color-mix(in srgb, var(--ai) ${Math.round(18+Math.min(1,value/max)*72)}%, var(--panel))`;
  return <div className="ai-chart-shell ai-calendar-shell"><div className="ai-chart-toolbar"><div className="ai-chart-context"><strong>Credits by day</strong><span>{activeDay?`${dateLabel(activeDay.date)} · ${metricLabel(activeDay.value,'credits')}`:`${dates.length} days · peak ${metricLabel(max,'credits')}`}</span></div><span className="ai-calendar-scale">Less <i/> <i/> <i/> More</span></div>
    <div className="ai-calendar-weekdays" style={{gridTemplateColumns:`repeat(${columns},${cell}px)`}}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=><span key={day}>{day}</span>)}</div>
    <div className="ai-calendar-grid" role="grid" aria-label="Predis daily credits calendar" style={{gridTemplateColumns:`repeat(${columns},${cell}px)`,gridTemplateRows:`repeat(${rows},${cell}px)`}}>{cells.map((day,index)=>day?<button key={day.date} type="button" role="gridcell" aria-label={`${dateLabel(day.date)}: ${metricLabel(day.value,'credits')}`} title={`${dateLabel(day.date)} · ${metricLabel(day.value,'credits')}`} onMouseEnter={()=>setActive(day.index)} onFocus={()=>setActive(day.index)} onClick={()=>setActive(day.index)} className={`ai-calendar-cell${active===day.index?' is-active':''}`} style={{background:color(day.value)}}><span>{Number(day.date.slice(-2))}</span>{day.value>0&&<b>{Number(day.value.toFixed(0))}</b>}</button>:<span key={`empty-${index}`} aria-hidden="true"/> )}</div>
    <div className="ai-chart-hint" aria-live="polite">{activeDay?`${dateLabel(activeDay.date)} · ${metricLabel(activeDay.value,'credits')}`:'Select or hover a date to inspect its credits. Empty days have no recorded usage.'}</div>
  </div>;
}

function CreatifyLollipopChart({dates,values}:{dates:string[];values:number[]}) {
  const [active,setActive]=useState<number|null>(null);
  const width=900,height=220,left=56,right=16,top=18,bottom=34,plotHeight=height-top-bottom;
  const max=Math.max(1,...values)*1.15,slot=(width-left-right)/Math.max(1,values.length);
  const labelEvery=values.length<=7?1:values.length<=30?5:15;
  const dayLabel=(value:string)=>dateLabel(value,{month:'short',day:'numeric'});
  return <div className="ai-chart-shell"><div className="ai-chart-toolbar"><div className="ai-chart-context"><strong>Daily credits</strong><span>{active!=null?`${dateLabel(dates[active])} · ${metricLabel(values[active]||0,'credits')}`:`${dates.length} days · ${sum(values).toLocaleString()} credits total`}</span></div></div>
    <svg className="ai-usage-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Creatify daily credits for ${dates.length} days`}>
      {[0,.5,1].map(fraction=>{const y=top+plotHeight*(1-fraction);return <g key={fraction}><line x1={left} x2={width-right} y1={y} y2={y} className="ai-chart-grid"/><text x={left-10} y={y+4} textAnchor="end" className="ai-chart-label">{Math.round(max*fraction)}</text></g>;})}
      {values.map((value,index)=>{const x=left+slot*index+slot/2,y=top+plotHeight-(value/max*plotHeight);return <g key={dates[index]} className="ai-lollipop-mark" tabIndex={0} role="button" aria-label={`${dateLabel(dates[index])}: ${metricLabel(value,'credits')}`} onMouseEnter={()=>setActive(index)} onFocus={()=>setActive(index)} onClick={()=>setActive(index)}><line x1={x} x2={x} y1={top+plotHeight} y2={y} className={`ai-lollipop-stem${active===index?' is-active':''}`}/><circle cx={x} cy={y} r={active===index?6:4} className={`ai-lollipop-dot${active===index?' is-active':''}`}><title>{`${dateLabel(dates[index])}: ${metricLabel(value,'credits')}`}</title></circle>{(index%labelEvery===0||index===values.length-1)&&<text x={x} y={height-9} textAnchor="middle" className="ai-chart-label">{dates[index]?.slice(5)}</text>}</g>;})}
    </svg><div className="ai-chart-hint" aria-live="polite">{active!=null?`${dateLabel(dates[active])} · ${metricLabel(values[active]||0,'credits')}`:'Hover or focus a marker to inspect the exact credits for that day.'}</div>
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
      <section className="card pad ai-provider-card ai-provider-featured"><Header title="OpenRouter"><span className="pill ai r">USD</span></Header><div className="ai-provider-stats"><Metric label="BookLender spend" value={usageMoney(sum(routerDaily))} note={`Recorded in the last ${range} days`}/><Metric label={`Remaining ${router!.balanceScope||'key limit'}`} value={router!.remainingUsd==null?'—':money(router!.remainingUsd)} note={router!.remainingUsd==null?router!.status==='not_configured'?'API key is not configured':'Live balance unavailable or this key has no limit':router!.balanceScope==='account'?'Live OpenRouter account balance':'Live OpenRouter key spending limit'}/></div><LineUsageChart dates={dates} values={routerDaily}/><p className="ai-chart-note">BookLender request costs by Eastern date. OpenRouter account usage uses UTC and can include other apps.</p></section>
      <div className="ai-spend-grid">
        <section className="card pad ai-provider-card"><Header title="Predis"><span className="pill ai r">Credits</span></Header><div className="ai-provider-stats"><Metric label={predisHistoryAvailable?'Credits used · Predis-reported':'Estimated credits used'} value={predisUsageTotal>0?Number(predisUsageTotal.toFixed(1)).toLocaleString():'—'} note={predisHistoryAvailable?`Exact charges found in available Predis runs · ${range} days`:predis!.estimatedCredits>0?`Estimate · 15 credits per generated image/slide · ${range} days`:predis!.historyStatus==='history_tool_unavailable'?'Predis MCP does not expose run credit history':'No recoverable media charges in this period'}/><Metric label="Actual account credits left" value={predis!.balanceStatus==='ok'&&predis!.remainingCredits!=null?Number(predis!.remainingCredits).toLocaleString():'—'} note={predis!.balanceStatus==='ok'?'Live from your Predis account':predis!.balanceStatus==='not_connected'?'Connect your Predis account to read its live balance':predis!.balanceStatus==='balance_tool_unavailable'?'Connected, but no readable account-balance tool was found. Refresh after the update.':predis!.balanceStatus==='balance_value_unrecognized'?'Predis account tool responded, but its credit field is not recognized yet.':'Predis balance is unavailable. Refresh or reconnect if sign-in expired.'}/></div>{predis!.canConnect&&['not_connected','reconnect_required'].includes(predis!.balanceStatus)&&<button className="btn ghost sm" onClick={()=>void connectPredis()} disabled={connecting}>{connecting?'Connecting…':predis!.balanceStatus==='not_connected'?'Connect Predis account':'Reconnect Predis account'}</button>}<PredisCalendarChart dates={dates} values={predisDaily}/><p className="ai-chart-note">{predisHistoryAvailable?'Calendar cells show explicit credit charges from Predis run history returned to BookLender.':'Calendar cells estimate BookLender generations at 15 credits per generated image or carousel slide.'} Current balance is read separately from Predis account information.</p></section>
        <section className="card pad ai-provider-card"><Header title="Creatify"><span className="pill ai r">Credits</span></Header><div className="ai-provider-stats"><Metric label="Credits used" value={sum(creatifyDaily)>0?Number(sum(creatifyDaily).toFixed(1)).toLocaleString():'—'} note={`Provider-reported usage · last ${range} days`}/><Metric label="Remaining credits" value={creatify!.remainingCredits==null?'—':Number(creatify!.remainingCredits).toLocaleString()} note={creatify!.balanceStatus==='ok'?'Live from Creatify Workspace API':creatify!.balanceStatus==='not_configured'?'Creatify API credentials are not configured':'Creatify balance is temporarily unavailable'}/></div><CreatifyLollipopChart dates={dates} values={creatifyDaily}/><p className="ai-chart-note">Daily credits reported by Creatify jobs; remaining balance is fetched from the Workspace API.</p></section>
      </div>
      <p className="ai-spend-footnote">When Predis exposes per-run credit charges, the chart uses those reported values; otherwise it shows BookLender's estimate. Account balance is live when Predis returns it. Currency and provider credits are shown separately.</p>
    </>}
  </div>;
}
