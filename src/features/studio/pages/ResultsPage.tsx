'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { studioApi, type LiveResultPost, type LiveResults } from '../api';
import { useStudio } from '../components/StudioProvider';
import { BarChart } from '../components/Charts';

const day = (date: Date) => date.toISOString().slice(0, 10);
const daysAgo = (days: number) => day(new Date(Date.now() - days * 86400000));
const number = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString();
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat('en-US', {month:'short', day:'numeric', year:'numeric', timeZone:'America/New_York'}).format(new Date(value)) : 'Awaiting provider date';

function PostTable({posts, onOpen}: {posts: LiveResultPost[]; onOpen: (id:number)=>void}) {
  return <div className="tblwrap"><table className="tbl results-table"><thead><tr><th>Post</th><th>Platform</th><th>Published</th><th>Reach</th><th>Engagements</th><th>Clicks</th><th>Status</th></tr></thead><tbody>{posts.map(item=><tr key={item.publicationId}>
    <td><button className="results-post-title" onClick={()=>onOpen(item.id)}>{item.title}</button><small>{item.format}</small></td>
    <td>{item.platform}</td><td>{dateLabel(item.publishedAt || item.scheduledAt)}</td><td className="num">{number(item.metrics.reach)}</td><td className="num">{number(item.engagement)}</td><td className="num">{number(item.metrics.clicks)}</td>
    <td><span className={`pill ${item.status === 'synced' ? 'ok' : ''}`}>{item.status === 'synced' ? 'Synced' : item.status === 'failed' ? 'Sync failed' : 'Pending'}</span></td>
  </tr>)}</tbody></table></div>;
}

export default function ResultsPage() {
  const {openPost} = useStudio();
  const [period, setPeriod] = useState(30);
  const [customFrom, setCustomFrom] = useState(daysAgo(29));
  const [customTo, setCustomTo] = useState(day(new Date()));
  const [platform, setPlatform] = useState('all');
  const [accountId, setAccountId] = useState('all');
  const [format, setFormat] = useState('all');
  const [results, setResults] = useState<LiveResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await studioApi.results({fromDate:period===0?customFrom:daysAgo(period-1), toDate:period===0?customTo:day(new Date()), platform, accountId, format});
      setResults(data); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load Results'); }
    finally { if (!silent) setLoading(false); }
  }, [period,customFrom,customTo,platform,accountId,format]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{const timer=window.setInterval(()=>{void load(true);},60000);return ()=>window.clearInterval(timer);},[load]);
  const refresh = async () => {
    setRefreshing(true);
    try { await studioApi.act('results',{action:'sync'}); setError('Analytics refresh queued. New data may take a few minutes.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not queue analytics refresh'); }
    finally { setRefreshing(false); }
  };
  const chart = useMemo(()=>{
    if (!results) return [];
    const size = results.daily.length <= 14 ? 1 : 7;
    const buckets: {label:string;value:number}[] = [];
    for (let i=0;i<results.daily.length;i+=size) {
      const slice=results.daily.slice(i,i+size);
      buckets.push({label:new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${slice[0].date}T00:00:00Z`)),value:slice.reduce((sum,item)=>sum+item.posts,0)});
    }
    return buckets;
  },[results]);
  const accounts=results?.accounts.filter(item=>platform==='all'||item.platform.toLowerCase()===platform)||[];
  const kpis=results ? [
    ['Published posts', number(results.publishedPosts), 'BookLender posts in this period'],
    ['Reach', number(results.totals.reach), `${results.metricCoverage.reach}/${results.publishedPosts} posts reporting`],
    ['Impressions', number(results.totals.impressions), `${results.metricCoverage.impressions}/${results.publishedPosts} posts reporting`],
    ['Engagements', number(results.engagement), 'Likes + comments + shares + saves'],
    ['Engagement rate', results.engagementRate == null ? '—' : `${results.engagementRate.toFixed(2)}%`, 'Engagements ÷ reported post reach'],
    ['Link clicks', number(results.totals.clicks), `${results.metricCoverage.clicks}/${results.publishedPosts} posts reporting`],
  ] : [];
  return <div className="results-page">
    <div className="results-intro"><div><h2>Publishing performance</h2><p>Live Zernio metrics for posts published through BookLender.</p></div><button className="btn" onClick={refresh} disabled={refreshing}>{refreshing?'Queuing…':'Refresh analytics'}</button></div>
    <div className="card results-filters">
      <label>Period<select value={period} onChange={event=>setPeriod(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 365 days</option><option value={0}>Custom dates</option></select></label>
      <label>Platform<select value={platform} onChange={event=>{setPlatform(event.target.value);setAccountId('all');}}><option value="all">All platforms</option>{[...new Set(results?.accounts.map(item=>item.platform)||[])].sort().map(item=><option value={item.toLowerCase()} key={item}>{item}</option>)}</select></label>
      <label>Account<select value={accountId} onChange={event=>setAccountId(event.target.value)}><option value="all">All connected accounts</option>{accounts.map(item=><option value={item.id} key={item.id}>{item.name} · {item.platform}</option>)}</select></label>
      <label>Format<select value={format} onChange={event=>setFormat(event.target.value)}><option value="all">All formats</option><option value="image">Image</option><option value="video">Video</option><option value="carousel">Carousel</option><option value="text">Text</option></select></label>
      {period===0&&<><label>From (UTC)<input type="date" value={customFrom} max={customTo} onChange={event=>setCustomFrom(event.target.value)}/></label><label>To (UTC)<input type="date" value={customTo} min={customFrom} max={day(new Date())} onChange={event=>setCustomTo(event.target.value)}/></label></>}
    </div>
    {error&&<div className="results-message" role="status">{error}</div>}
    {loading&&<div className="card pad sec">Loading verified analytics…</div>}
    {results&&!loading&&<>
      <div className="results-meta"><span>{results.fromDate} to {results.toDate} · {results.syncedPosts} synced · {results.pendingPosts} awaiting analytics</span><span>{results.lastSyncedAt?`Last checked ${dateLabel(results.lastSyncedAt)}`:'No analytics sync yet'}</span></div>
      <div className="results-kpis">{kpis.map(([label,value,detail])=><div className="kpi" key={label}><span>{label}</span><b>{value}</b><small>{detail}</small></div>)}</div>
      <p className="results-note">{results.note}</p>
      {results.publishedPosts===0?<div className="card pad sec results-empty"><h3>No published BookLender posts in this period</h3><p>Choose a longer date range or wait for a scheduled post to publish.</p></div>:<>
        <div className="results-grid"><section className="card pad sec"><h3>Publishing activity</h3><p className="small muted">Posts published by day or week. Dates are UTC.</p>{chart.length>0&&<BarChart data={chart} max={Math.max(1,...chart.map(item=>item.value))} step={Math.max(1,Math.ceil(Math.max(1,...chart.map(item=>item.value))/4))} label="BookLender posts published over time" all={chart.length<=7}/>}</section>
          <section className="card pad sec"><h3>Performance by platform</h3><div className="results-group-list">{results.byPlatform.map(item=><div className="results-group" key={item.name}><b>{item.name}</b><span>{item.posts} posts</span><span>{number(item.reach)} reach</span><span>{number(item.engagement)} engagements</span></div>)}</div></section></div>
        <div className="results-grid"><section className="card pad sec"><h3>Performance by format</h3><div className="results-group-list">{results.byFormat.map(item=><div className="results-group" key={item.name}><b>{item.name}</b><span>{item.posts} posts</span><span>{number(item.reach)} reach</span><span>{number(item.engagement)} engagements</span></div>)}</div></section>
          <section className="card pad sec"><h3>Metric coverage</h3><p className="small muted">Networks report different metrics. A dash means Zernio did not supply that value.</p><div className="results-coverage">{(['reach','impressions','clicks','views','saves'] as const).map(key=><div key={key}><span>{key}</span><b>{results.metricCoverage[key]} / {results.publishedPosts} posts</b></div>)}</div></section></div>
        <section className="card pad sec"><h3>Interaction breakdown</h3><div className="results-interactions">{(['likes','comments','shares','saves','views','clicks'] as const).map(key=><div key={key}><span>{key}</span><b>{number(results.totals[key])}</b><small>{results.metricCoverage[key]} posts reporting</small></div>)}</div></section>
        <section className="card pad sec"><h3>Connected account followers</h3><p className="small muted">Account-wide follower counts include activity outside BookLender. Zernio refreshes these counts daily.</p>{results.followers.length ? <div className="results-followers">{results.followers.map(item=><div key={item.accountId}><b>{item.name}</b><span>{item.platform}</span><strong>{number(item.current)} followers</strong><small>{item.growth==null?'Growth unavailable':`${item.growth>=0?'+':''}${number(item.growth)} in selected period`}</small></div>)}</div> : <p className="muted">Follower data is not available yet.</p>}</section>
        <section className="card pad sec"><h3>Top posts</h3><p className="small muted">Ranked by reported likes, comments, shares and saves.</p>{results.topPosts.length?<PostTable posts={results.topPosts} onOpen={openPost}/>:<p className="muted">Post analytics are still syncing.</p>}</section>
        <section className="card pad sec"><h3>Recent published posts</h3><PostTable posts={results.recentPosts} onOpen={openPost}/></section>
      </>}
    </>}
  </div>;
}
