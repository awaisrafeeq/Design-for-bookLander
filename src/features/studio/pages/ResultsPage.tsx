'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { studioApi, type LiveResultPost, type LiveResults } from '../api';
import { useStudio } from '../components/StudioProvider';
import { Icon } from '../components/Design';

type Metric = 'reach'|'impressions'|'engagementRate'|'clicks'|'followers';
type ChartKind = 'bar'|'line'|'pie';
type Point = {label:string;value:number|null};
const metrics: {key:Metric;label:string;hint:string;color:string}[] = [
  {key:'reach',label:'Reach',hint:'People reached by published posts',color:'#398f79'},
  {key:'impressions',label:'Impressions',hint:'Times your posts were displayed',color:'#507be6'},
  {key:'engagementRate',label:'Engagement rate',hint:'Interactions divided by reported reach',color:'#8b63d9'},
  {key:'clicks',label:'Link clicks',hint:'Clicks reported by connected platforms',color:'#e69a3a'},
  {key:'followers',label:'New followers',hint:'Net account follower change in this period',color:'#d96e89'},
];
const today=()=>new Date().toISOString().slice(0,10);
const since=(n:number)=>new Date(Date.now()-(n-1)*86400000).toISOString().slice(0,10);
const full=(n:number|null|undefined)=>n==null?'—':Math.round(n).toLocaleString();
const compact=(n:number|null|undefined)=>n==null?'—':new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(n);
const pretty=(s:string)=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const shown=(n:number|null,key:Metric)=>n==null?'—':key==='engagementRate'?n.toFixed(2)+'%':key==='followers'&&n>0?'+'+compact(n):compact(n);
const dateText=(s:string|null)=>s?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'America/New_York'}).format(new Date(s)):'Date pending';

function ChartView({data,kind,color,metric}:{data:Point[];kind:ChartKind;color:string;metric:Metric}) {
  const rows=data.filter(row=>row.value!=null) as {label:string;value:number}[];
  if(!rows.length)return <div className="results-chart-empty">Verified data will appear here after analytics sync.</div>;
  if(kind==='pie') {
    if(rows.some(row=>row.value<0)||rows.every(row=>row.value===0))return <div className="results-chart-empty">Pie view needs positive values. Choose bars or line.</div>;
    const total=rows.reduce((sum,row)=>sum+row.value,0);let angle=0;
    const colors=['#273c61','#4778c8','#38a28a','#e6a044','#9573d2','#d66f89','#6b879f'];
    const segments=rows.map((row,i)=>{const start=angle;angle+=row.value/total*360;return colors[i%colors.length]+' '+start+'deg '+angle+'deg';});
    return <div className="results-pie-wrap"><div className="results-pie" role="img" aria-label={'Share by '+rows.map(row=>row.label).join(', ')} style={{background:'conic-gradient('+segments.join(',')+')'}}><div><b>{shown(total,metric)}</b><span>Total</span></div></div><div className="results-pie-legend">{rows.map((row,i)=><div key={row.label}><i style={{background:colors[i%colors.length]}}/><span>{row.label}</span><b>{shown(row.value,metric)}</b></div>)}</div></div>;
  }
  if(kind==='line') {
    const width=720,height=260,left=42,right=18,top=24,bottom=38;
    const low=Math.min(0,...rows.map(row=>row.value)),high=Math.max(1,...rows.map(row=>row.value)),span=Math.max(1,high-low);
    const coords=rows.map((row,i)=>({x:rows.length===1?width/2:left+i*(width-left-right)/Math.max(1,rows.length-1),y:top+(height-top-bottom)-(row.value-low)/span*(height-top-bottom),...row}));
    const path=coords.map((row,i)=>(i?'L':'M')+' '+row.x+' '+row.y).join(' ');
    return <svg className="results-line-chart" viewBox={'0 0 '+width+' '+height} role="img" aria-label={pretty(metric)+' comparison'}>{[0,1,2,3].map(i=>{const y=top+i*(height-top-bottom)/3;return <line key={i} x1={left} x2={width-right} y1={y} y2={y} className="results-gridline"/>})}<path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{coords.map((row,i)=><g key={row.label}><circle cx={row.x} cy={row.y} r="5" fill="white" stroke={color} strokeWidth="3"/><text x={row.x} y={height-10} textAnchor="middle">{row.label}</text>{(i===0||i===coords.length-1||coords.length<=8)&&<text className="results-point-value" x={row.x} y={row.y-11} textAnchor="middle">{shown(row.value,metric)}</text>}</g>)}</svg>;
  }
  const max=Math.max(1,...rows.map(row=>row.value));
  return <div className="results-bars">{rows.map(row=><div className="results-bar-row" key={row.label}><span>{row.label}</span><div><i style={{width:Math.max(row.value>0?1:0,row.value/max*100)+'%',background:color}}/></div><b>{shown(row.value,metric)}</b></div>)}</div>;
}
function ChartSwitcher({value,onChange}:{value:ChartKind;onChange:(kind:ChartKind)=>void}) {
  return <div className="results-chart-switch" aria-label="Chart style">{(['bar','line','pie'] as ChartKind[]).map(kind=><button type="button" key={kind} className={value===kind?'active':''} aria-pressed={value===kind} onClick={()=>onChange(kind)}><Icon name={kind==='bar'?'chart':kind==='line'?'trend':'pie'}/>{kind==='bar'?'Bars':kind==='line'?'Line':'Pie'}</button>)}</div>;
}
function KpiDialog({metric,results,onClose}:{metric:Metric;results:LiveResults;onClose:()=>void}) {
  const [kind,setKind]=useState<ChartKind>('bar');const definition=metrics.find(item=>item.key===metric)!;
  const data=results.byPlatform.map(row=>{
    let value:number|null=null;
    if(metric==='engagementRate')value=row.engagementRate;
    else if(metric==='followers'){
      const accounts=results.followers.filter(account=>account.platform.toLowerCase()===row.name.toLowerCase());
      value=accounts.length&&accounts.every(account=>account.growth!=null)?accounts.reduce((sum,account)=>sum+(account.growth||0),0):null;
    }else value=row[metric];
    return {label:pretty(row.name),value};
  });
  return <div className="results-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="results-dialog" role="dialog" aria-modal="true" aria-labelledby="results-dialog-title"><button className="results-dialog-close" onClick={onClose} aria-label="Close">×</button><span className="results-eyebrow">PLATFORM BREAKDOWN</span><h2 id="results-dialog-title">{definition.label}</h2><p>{definition.hint}. Period: {results.fromDate} to {results.toDate}.</p><ChartSwitcher value={kind} onChange={setKind}/><ChartView data={data} kind={kind} color={definition.color} metric={metric}/><div className="results-dialog-table">{data.map(row=><div key={row.label}><span>{row.label}</span><b>{shown(row.value,metric)}</b></div>)}</div></section></div>;
}

export default function ResultsPage() {
  const {state,openPost}=useStudio();
  const [period,setPeriod]=useState(30),[customFrom,setCustomFrom]=useState(since(30)),[customTo,setCustomTo]=useState(today());
  const [results,setResults]=useState<LiveResults|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[refreshing,setRefreshing]=useState(false);
  const [platform,setPlatform]=useState('all'),[dialog,setDialog]=useState<Metric|null>(null),[chartMetric,setChartMetric]=useState<Metric>('reach');
  const [compareChart,setCompareChart]=useState<ChartKind>('bar'),[trendChart,setTrendChart]=useState<ChartKind>('line'),[trendMode,setTrendMode]=useState<'posts'|'engagement'>('engagement');
  useEffect(()=>{if(!dialog)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setDialog(null);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[dialog]);
  const load=useCallback(async(silent=false)=>{
    if(!silent)setLoading(true);
    try{const data=await studioApi.results({fromDate:period===0?customFrom:since(period),toDate:period===0?customTo:today(),platform:'all',accountId:'all',format:'all'});setResults(data);setError('');}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not load Results');}
    finally{if(!silent)setLoading(false);}
  },[period,customFrom,customTo]);
  useEffect(()=>{void load();},[load]);useEffect(()=>{const timer=window.setInterval(()=>void load(true),60000);return()=>window.clearInterval(timer);},[load]);
  const refresh=async()=>{setRefreshing(true);try{await studioApi.act('results',{action:'sync'});setError('Analytics refresh requested. New results will appear after Zernio syncs.');}catch(cause){setError(cause instanceof Error?cause.message:'Could not refresh analytics');}finally{setRefreshing(false);}};
  const platforms=useMemo(()=>results?.accounts.reduce<string[]>((list,account)=>list.some(value=>value.toLowerCase()===account.platform.toLowerCase())?list:[...list,account.platform],[])||[],[results]);
  const selectedGroup=results?.byPlatform.find(row=>row.name.toLowerCase()===platform.toLowerCase());
  const kpiValue=(key:Metric):number|null=>{
    if(!results)return null;
    if(platform!=='all'){
      if(key==='followers'){
        const accounts=results.followers.filter(row=>row.platform.toLowerCase()===platform);
        return accounts.length&&accounts.every(row=>row.growth!=null)?accounts.reduce((sum,row)=>sum+(row.growth||0),0):null;
      }
      return !selectedGroup?null:key==='engagementRate'?selectedGroup.engagementRate:selectedGroup[key];
    }
    if(key==='followers')return results.followers.length&&results.followers.every(row=>row.growth!=null)?results.followers.reduce((sum,row)=>sum+(row.growth||0),0):null;
    return key==='engagementRate'?results.engagementRate:results.totals[key];
  };
  const kpiDetail=(key:Metric)=>{
    if(!results)return '';
    if(key==='followers'){
      const rows=results.followers.filter(row=>platform==='all'||row.platform.toLowerCase()===platform);
      return rows.length?'Account audience '+full(rows.reduce((sum,row)=>sum+(row.current||0),0)):'Follower data unavailable';
    }
    return key==='engagementRate'?'Interactions divided by reach':results.metricCoverage[key]+' of '+results.publishedPosts+' posts reporting';
  };
  const comparisonData:Point[]=results?results.byPlatform.map(row=>{
    let value:number|null=null;
    if(chartMetric==='engagementRate')value=row.engagementRate;
    else if(chartMetric==='followers'){
      const accounts=results.followers.filter(account=>account.platform.toLowerCase()===row.name.toLowerCase());
      value=accounts.length&&accounts.every(account=>account.growth!=null)?accounts.reduce((sum,account)=>sum+(account.growth||0),0):null;
    }else value=row[chartMetric];
    return {label:pretty(row.name),value};
  }):[];
  const trendData:Point[]=useMemo(()=>{
    if(!results)return [];
    const rows=results.daily.map(day=>{
      const channel=platform==='all'?null:Object.entries(day.platforms).find(([name])=>name.toLowerCase()===platform)?.[1];
      const amount=channel?(trendMode==='posts'?channel.posts:channel.engagement):(trendMode==='posts'?day.posts:day.engagement);
      return {label:new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(day.date+'T00:00:00Z')),value:amount};
    });
    if(rows.length<=14)return rows;
    const buckets:Point[]=[];
    for(let i=0;i<rows.length;i+=7){const slice=rows.slice(i,i+7);buckets.push({label:slice[0].label,value:slice.reduce((sum,row)=>sum+(row.value||0),0)});}
    return buckets;
  },[results,platform,trendMode]);
  const content=useMemo(()=>!results?[]:platform==='all'?results.topPosts:results.recentPosts.filter(row=>row.platform.toLowerCase()===platform).slice(0,6),[results,platform]);
  const formatData:Point[]=results?results.byFormat.map(row=>({label:pretty(row.name),value:row.engagement})): [];
  const platformGroup=results?.byPlatform.find(row=>row.name.toLowerCase()===platform);
  const periodLabel=results?results.fromDate+' – '+results.toDate:'';
  const updated=results?.lastSyncedAt?new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}).format(new Date(results.lastSyncedAt))+' ET':'Waiting for first sync';
  return <div className="results-page">
    <div className="results-intro"><div><span className="results-eyebrow">SOCIAL ANALYTICS</span><h2>{platform==='all'?'Performance overview':pretty(platform)+' performance'}</h2><p>How your published BookLender content is performing across connected channels.</p></div><button className="btn results-refresh" onClick={refresh} disabled={refreshing}><Icon name="retry"/>{refreshing?'Refreshing…':'Refresh'}</button></div>
    <div className="results-topline"><div className="results-tabs" role="tablist" aria-label="Results dashboard"><button role="tab" aria-selected={platform==='all'} className={platform==='all'?'active':''} onClick={()=>setPlatform('all')}><span className="results-platform-mark overview">B</span>Overview</button>{platforms.map(name=><button role="tab" aria-selected={platform===name.toLowerCase()} className={platform===name.toLowerCase()?'active':''} onClick={()=>setPlatform(name.toLowerCase())} key={name}><span className={'results-platform-mark '+name.toLowerCase()}>{pretty(name).slice(0,1)}</span>{pretty(name)}</button>)}</div><div className="results-periods" aria-label="Date range">{[[7,'7 days'],[30,'30 days'],[90,'90 days'],[0,'Custom']].map(([value,label])=><button key={value} className={period===value?'active':''} onClick={()=>setPeriod(Number(value))}>{label}</button>)}</div></div>
    {period===0&&<div className="results-custom-dates"><label>From<input type="date" value={customFrom} max={customTo} onChange={event=>setCustomFrom(event.target.value)}/></label><span>to</span><label>To<input type="date" value={customTo} min={customFrom} max={today()} onChange={event=>setCustomTo(event.target.value)}/></label></div>}
    <div className="results-statusline"><span><i className={results?.syncedPosts?'live':''}/>{results?.syncedPosts?results.syncedPosts+' posts with analytics':'Analytics syncing'} · Zernio</span><span>{periodLabel} · Updated {updated}</span></div>
    {error&&<div className="results-message" role="status">{error}</div>}
    {loading&&!results&&<div className="card pad sec">Loading performance data…</div>}
    {results&&!loading&&<>
      <div className="results-kpis">{metrics.map(item=><button type="button" className="results-kpi-card" key={item.key} style={{borderTopColor:item.color}} onClick={()=>setDialog(item.key)} aria-label={'See '+item.label+' by platform'}><span>{item.label}<Icon name="chevR"/></span><b>{shown(kpiValue(item.key),item.key)}</b><small>{kpiDetail(item.key)}</small></button>)}</div>
      <div className="results-dashboard-grid">
        <section className="card pad sec results-chart-panel"><header><div><span className="results-eyebrow">{platform==='all'?'CHANNEL COMPARISON':pretty(platform).toUpperCase()}</span><h3>{platform==='all'?'Performance by platform':pretty(platform)+' by publish date'}</h3><p>{platform==='all'?'Compare a metric across connected platforms.':'Engagement shows the latest lifetime totals for posts published each day.'}</p></div>{platform==='all'&&<ChartSwitcher value={compareChart} onChange={setCompareChart}/>}</header>
          {platform==='all'?<><div className="results-metric-switch">{metrics.map(item=><button key={item.key} className={chartMetric===item.key?'active':''} onClick={()=>setChartMetric(item.key)}>{item.label}</button>)}</div><ChartView data={comparisonData} kind={compareChart} color={metrics.find(item=>item.key===chartMetric)!.color} metric={chartMetric}/></>:<><ChartView data={trendData} kind={trendChart} color="#4778c8" metric="reach"/><div className="results-chart-tools"><div className="results-metric-switch"><button className={trendMode==='posts'?'active':''} onClick={()=>setTrendMode('posts')}>Published posts</button><button className={trendMode==='engagement'?'active':''} onClick={()=>setTrendMode('engagement')}>Engagements</button></div><ChartSwitcher value={trendChart} onChange={setTrendChart}/></div></>}</section>
        <section className="card pad sec results-side-panel"><header><div><span className="results-eyebrow">PUBLISHED CONTENT</span><h3>{platform==='all'?'Channel snapshot':pretty(platform)+' snapshot'}</h3></div><span className="results-count">{platform==='all'?results.publishedPosts:platformGroup?.posts||0} posts</span></header><div className="results-snapshot"><div><span>Published</span><b>{full(platform==='all'?results.publishedPosts:platformGroup?.posts||0)}</b></div><div><span>Awaiting analytics</span><b>{full(platform==='all'?results.pendingPosts:platformGroup?platformGroup.posts-platformGroup.syncedPosts:null)}</b></div><div><span>Engagements</span><b>{full(platform==='all'?results.engagement:platformGroup?.engagement??null)}</b></div></div>
          <div className="results-platform-list">{results.byPlatform.map(row=><button key={row.name} className={platform===row.name.toLowerCase()?'selected':''} onClick={()=>setPlatform(row.name.toLowerCase())}><span className={'results-platform-mark '+row.name.toLowerCase()}>{pretty(row.name).slice(0,1)}</span><span><b>{pretty(row.name)}</b><small>{row.posts} published</small></span><strong>{shown(row.engagementRate,'engagementRate')}</strong></button>)}</div>
        </section>
      </div>
      <div className="results-lower-grid">
        <section className="card pad sec results-format-panel"><header><div><span className="results-eyebrow">CONTENT MIX · ALL CHANNELS</span><h3>Engagement by format</h3><p>Compare reported interactions across image, video and carousel posts.</p></div><ChartSwitcher value={compareChart} onChange={setCompareChart}/></header><ChartView data={formatData} kind={compareChart} color="#8b63d9" metric="reach"/></section>
        <section className="card pad sec results-content-panel"><header><div><span className="results-eyebrow">{platform==='all'?'TOP POSTS':'RECENT POSTS'}</span><h3>{platform==='all'?'Content to learn from':'Latest on '+pretty(platform)}</h3><p>Open a post to review its published content and metrics.</p></div></header><div className="results-content-grid">{content.length?content.map(item=><PostCard key={item.publicationId} item={item} posts={state.posts} onOpen={openPost}/>):<div className="results-chart-empty">No published posts in this period.</div>}</div></section>
      </div>
      <div className="results-disclaimer">{results.note}</div>
    </>}
    {dialog&&results&&<KpiDialog metric={dialog} results={results} onClose={()=>setDialog(null)}/>}
  </div>;
}

function PostCard({item,posts,onOpen}:{item:LiveResultPost;posts:ReturnType<typeof useStudio>['state']['posts'];onOpen:(id:number)=>void}) {
  const media=posts.find(post=>post.id===item.id)?.media?.[0];
  return <button className="results-content-card" onClick={()=>onOpen(item.id)}><div className="results-content-media">{media?.type==='image'?<img src={media.url} alt="" loading="lazy"/>:<span className="results-media-fallback"><Icon name={media?.type==='video'?'play':'stack'}/></span>}<span className="results-platform-tag">{pretty(item.platform)}</span></div><div className="results-content-copy"><b>{item.title}</b><span>{pretty(item.format)} · {dateText(item.publishedAt||item.scheduledAt)}</span><div><small>Reach <strong>{full(item.metrics.reach)}</strong></small><small>Engagement <strong>{full(item.engagement)}</strong></small><small>Clicks <strong>{full(item.metrics.clicks)}</strong></small></div></div></button>;
}
