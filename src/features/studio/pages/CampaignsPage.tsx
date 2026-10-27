'use client';
import { useCallback, useEffect, useState } from 'react';
import { studioApi, type Campaign, type CampaignPayload, type CampaignConnections, type CampaignAdTimeline } from '../api';
import { useStudio } from '../components/StudioProvider';
import { Icon } from '../components/Icon';

const day = () => new Date().toISOString().slice(0, 10);
const initial = (): CampaignPayload => ({name:'',goal:'traffic',budgetType:'daily',budget:'',startDate:day(),endDate:day(),url:'',headline:'',body:'',keywords:'',audience:'',location:'United States',ageMin:18,ageMax:65,cta:'Learn more',platform:'meta'});
const label = (status: string) => ({draft:'Draft',review:'Awaiting review',approved:'Plan approved'}[status] || status);
const network = (value: string) => value === 'meta' ? 'Meta' : 'Google Ads';
const showDate = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

export default function CampaignsPage() {
  const {state, notify} = useStudio();
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [view,setView]=useState<'list'|'edit'|'detail'>('list');
  const [tab,setTab]=useState<'meta'|'google'>('meta');
  const [period,setPeriod]=useState<7|30|90>(30);
  const [platformChoice,setPlatformChoice]=useState<'meta'|'google'|'both'>('meta');
  const [form,setForm]=useState<CampaignPayload>(initial);
  const [postId,setPostId]=useState<number | null>(null);
  const [editing,setEditing]=useState<Campaign | null>(null);
  const [selected,setSelected]=useState<Campaign | null>(null);
  const [instructions,setInstructions]=useState('');
  const [connections,setConnections]=useState<CampaignConnections | null>(null);
  const [checking,setChecking]=useState(false);
  const [selectedAdsAccount,setSelectedAdsAccount]=useState('');
  const [analytics,setAnalytics]=useState<CampaignAdTimeline|null>(null);
  const [syncing,setSyncing]=useState(false);
  const canManage=Boolean(state.permissions?.['campaigns.manage']);
  const canApprove=Boolean(state.permissions?.['campaigns.approve']);
  const approved=state.posts.filter(post=>['review','scheduled','published'].includes(post.stage) && post.approvedVersion === post.version && post.media?.length);
  const post=state.posts.find(item=>item.id===postId);
  const load=useCallback(async()=>{try {const data=await studioApi.get('campaigns');setCampaigns(data.campaigns);} catch(error){notify((error as Error).message,true);} finally{setLoading(false);}},[notify]);
  useEffect(()=>{void load();},[load]);
  const action=async(body:Record<string,unknown>)=>{
    setBusy(true);
    try {const result=await studioApi.act<{message:string;campaign:Campaign}>('campaigns',body);notify(result.message);await load();return result.campaign;}
    catch(error){notify((error as Error).message,true);return null;}
    finally{setBusy(false);}
  };
  const set = (key:keyof CampaignPayload,value:string|number) => setForm(current=>({...current,[key]:value}));
  const newDraft=()=>{setEditing(null);setPostId(null);setForm(initial());setPlatformChoice('meta');setView('edit');};
  const choosePost=(id:number)=>{const item=state.posts.find(p=>p.id===id);setPostId(id);if(item&&!editing)setForm(current=>({...current,name:item.title,headline:item.title.slice(0,180),body:item.caption||''}));};
  const edit=(item:Campaign)=>{setEditing(item);setPostId(item.postId);setForm(item.payload);setPlatformChoice(item.platform);setView('edit');};
  const save=async()=>{
    if(platformChoice==='both'&&!editing){
      setBusy(true);
      try {const result=await studioApi.act<{message:string;campaigns:Campaign[]}>('campaigns',{action:'create-both',postId,payload:form});notify(result.message);await load();setSelected(result.campaigns[0]);setView('detail');}
      catch(error){notify((error as Error).message,true);} finally{setBusy(false);}
      return;
    }
    const result=await action(editing?{action:'update',id:editing.id,payload:form}:{action:'create',postId,platform:form.platform,payload:form});if(result){setSelected(result);setView('detail');}
  };
  const generate=async()=>{
    if(!postId)return;
    setBusy(true);
    try {
      const result=await studioApi.act<{message:string;headline:string;body:string}>('campaigns',{action:'generate-copy',postId,platform:form.platform,instructions});
      setForm(current=>({...current,headline:result.headline,body:result.body}));notify(result.message);
    } catch(error){notify((error as Error).message,true);} finally{setBusy(false);}
  };
  const checkConnections=useCallback(async()=>{setChecking(true);try{setConnections(await studioApi.campaignConnections());}catch(error){notify((error as Error).message,true);}finally{setChecking(false);}},[notify]);
  useEffect(()=>{void checkConnections();},[checkConnections]);
  const adOptions=(connections?.connections||[]).filter(item=>item.platform===tab&&item.status==='available')
    .flatMap(connection=>connection.accounts.filter(account=>account.selectable&&account.id).map(account=>({
      key:`${connection.accountId}::${account.id}`,connectionId:connection.accountId,adAccountId:account.id,
      name:account.name,connectionName:connection.name,currency:account.currency,platform:connection.platform
    })));
  const activeAdOption=adOptions.find(item=>item.key===selectedAdsAccount)||null;
  useEffect(()=>{
    if(!adOptions.length){setSelectedAdsAccount('');setAnalytics(null);return;}
    if(!adOptions.some(item=>item.key===selectedAdsAccount))setSelectedAdsAccount(adOptions[0].key);
  },[tab,connections,selectedAdsAccount]);
  const refreshAnalytics=useCallback(async(option:typeof activeAdOption,days:number)=>{
    if(!option)return;
    setSyncing(true);
    try{
      const end=new Date();const start=new Date(end);start.setDate(start.getDate()-(days-1));
      const iso=(value:Date)=>value.toISOString().slice(0,10);
      const data=await studioApi.campaignAnalytics({platform:option.platform,accountId:option.connectionId,adAccountId:option.adAccountId,fromDate:iso(start),toDate:iso(end)});
      setAnalytics(data);
    }catch(error){setAnalytics(null);notify((error as Error).message,true);}
    finally{setSyncing(false);}
  },[notify]);
  useEffect(()=>{if(activeAdOption)void refreshAnalytics(activeAdOption,period);else setAnalytics(null);},[selectedAdsAccount,tab,period,connections]);
  const change=async(name:string)=>{if(!selected)return;const result=await action({action:name,id:selected.id});if(result){setSelected(result);if(name==='archive')setView('list');}};
  const count=(status:string)=>campaigns.filter(item=>item.status===status).length;
  const money=(p:CampaignPayload)=>p.budget ? `$${Number(p.budget).toLocaleString()} ${p.budgetType==='daily'?'per day':'total'}` : 'Not set';
  const thumb=post?.media?.find(item=>item.type==='image');
  const preview=(item:typeof post)=>item?.media?.find(asset=>asset.type==='image')?.url;
  const queue=campaigns.filter(item=>item.status==='review');
  const sumMetric=(key:'spend'|'conversions'|'impressions'|'reach'|'clicks'|'purchaseValue')=>(analytics?.rows||[]).reduce((sum,row)=>sum+(typeof row[key]==='number'?row[key] as number:0),0);
  const totals={spend:sumMetric('spend'),conversions:sumMetric('conversions'),impressions:sumMetric('impressions'),reach:sumMetric('reach'),clicks:sumMetric('clicks'),purchaseValue:sumMetric('purchaseValue')};
  const ctr=totals.impressions?totals.clicks/totals.impressions*100:0;
  const cpc=totals.clicks?totals.spend/totals.clicks:0;
  const cpm=totals.impressions?totals.spend/totals.impressions*1000:0;
  const costPerResult=totals.conversions?totals.spend/totals.conversions:0;
  const roas=totals.spend?totals.purchaseValue/totals.spend:0;
  const currency=analytics?.currency||activeAdOption?.currency||'USD';
  const formatMoney=(value:number)=>{try{return new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:2}).format(value);}catch{return `$${value.toFixed(2)}`;}};

  if(view==='edit') return <div className="campaign-page">
    <button className="campaign-back" onClick={()=>setView(editing?'detail':'list')}>Campaigns &nbsp;›&nbsp; {editing?'Edit plan':'New campaign'}</button>
    <div className="campaign-title"><div><h2>{editing?'Edit campaign plan':'Turn a post into a campaign'}</h2><p>Choose an approved post, shape the ad, and save a plan for review.</p></div></div>
    <div className="campaign-create"><div className="campaign-steps">
      <section className="card campaign-step"><div className="campaign-step-title"><i>1</i><div><h3>Choose the post</h3><p>Only approved posts with media are available.</p></div></div>
        {approved.length?<div className="campaign-post-grid">{approved.map(item=><button key={item.id} type="button" className={postId===item.id?'chosen':''} onClick={()=>choosePost(item.id)} disabled={Boolean(editing)}>{preview(item)?<img src={preview(item)} alt=""/>:<span className="campaign-media-fallback"><Icon name="image"/></span>}<span><b>{item.title}</b><small>✓ Approved v{item.version} · {item.format}</small></span></button>)}</div>:<p className="muted">Approve a post with media in Review first.</p>}
      </section>
      <section className="card campaign-step"><div className="campaign-step-title"><i>2</i><div><h3>Where it runs</h3><p>Choose a platform, or create two separate plans.</p></div></div><div className="campaign-options">{(['meta','google','both'] as const).map(value=><button key={value} type="button" className={platformChoice===value?'chosen':''} disabled={Boolean(editing)&&value!==editing?.platform} onClick={()=>{setPlatformChoice(value);if(value!=='both')set('platform',value);}}><span className="campaign-radio"/><b>{value==='both'?'Both':network(value)}</b><small>{value==='meta'?'Facebook and Instagram':value==='google'?'Google Search':'Two plans, reviewed separately'}</small></button>)}</div><label>Goal<select value={form.goal} onChange={e=>set('goal',e.target.value)}><option value="traffic">Website traffic</option><option value="awareness">Awareness</option><option value="engagement">Engagement</option></select></label></section>
      <section className="card campaign-step"><div className="campaign-step-title"><i>3</i><div><h3>Ad copy</h3><p>Edit the text and destination for this campaign.</p></div></div>
        <div className="campaign-ai"><label>Instructions for AI <span className="muted">(optional)</span><input value={instructions} maxLength={1000} onChange={e=>setInstructions(e.target.value)} placeholder="For example: focus on weekend reading"/></label><button type="button" className="btn ghost" disabled={busy||!postId} onClick={()=>void generate()}><Icon name="spark"/> {busy?'Working…':'Generate copy'}</button></div>
        <label>Campaign name<input value={form.name} maxLength={180} onChange={e=>set('name',e.target.value)}/></label>
        <label>Headline<input value={form.headline} maxLength={180} onChange={e=>set('headline',e.target.value)}/></label>
        <label>Primary text<textarea rows={4} value={form.body} maxLength={5000} onChange={e=>set('body',e.target.value)}/></label>
        <div className="campaign-fields"><label>Destination URL<input type="url" placeholder="https://..." value={form.url} onChange={e=>set('url',e.target.value)}/></label><label>Button<select value={form.cta} onChange={e=>set('cta',e.target.value)}><option>Learn more</option><option>Shop now</option><option>Sign up</option><option>Get offer</option></select></label></div>
      </section>
      <section className="card campaign-step"><div className="campaign-step-title"><i>4</i><div><h3>Image or video</h3><p>Approved media from the post is used in this plan.</p></div></div><div className="campaign-media-row">{thumb?<img src={thumb.url} alt="Selected post media"/>:<span className="campaign-media-fallback"><Icon name="image"/></span>}<p>{post?.title||'Choose a post first'}<small>To change the media, edit and approve the post in Review.</small></p></div></section>
      <section className="card campaign-step"><div className="campaign-step-title"><i>5</i><div><h3>Smart audience</h3><p>Choose location, age range, interests, and search terms.</p></div></div><div className="campaign-fields"><label>Location<input value={form.location} onChange={e=>set('location',e.target.value)}/></label><label>Minimum age<input type="number" min={18} max={65} value={form.ageMin} onChange={e=>set('ageMin',Number(e.target.value))}/></label><label>Maximum age<input type="number" min={18} max={65} value={form.ageMax} onChange={e=>set('ageMax',Number(e.target.value))}/></label></div><label>Meta interests<textarea rows={2} value={form.audience} onChange={e=>set('audience',e.target.value)} placeholder="Reading, books, audiobooks"/></label><label>Google search keywords<textarea rows={2} value={form.keywords} onChange={e=>set('keywords',e.target.value)} placeholder="book rental, rent books"/></label><p className="campaign-hint">Audience estimates will appear after ad account reporting is connected.</p></section>
      <section className="card campaign-step"><div className="campaign-step-title"><i>6</i><div><h3>Dates</h3><p>Plan your campaign in Eastern Time.</p></div></div><div className="campaign-fields"><label>Start date<input type="date" value={form.startDate} onChange={e=>set('startDate',e.target.value)}/></label><label>End date<input type="date" value={form.endDate} onChange={e=>set('endDate',e.target.value)}/></label></div></section>
      <section className="card campaign-step"><div className="campaign-step-title"><i>7</i><div><h3>Budget</h3><p>Set the amount for review. Saving a plan does not spend money.</p></div></div><div className="campaign-budget-type"><button type="button" className={form.budgetType==='daily'?'chosen':''} onClick={()=>set('budgetType','daily')}>Daily</button><button type="button" className={form.budgetType==='lifetime'?'chosen':''} onClick={()=>set('budgetType','lifetime')}>Total</button></div><div className="campaign-budget-input"><span>$</span><input aria-label="Budget in USD" type="number" min="0.01" step="0.01" value={form.budget} onChange={e=>set('budget',e.target.value)} placeholder="0"/><small>{form.budgetType==='daily'?'per day':'total'}</small></div>{platformChoice==='both'&&<p className="campaign-hint">This budget is saved on each of the two plans. Review each separately.</p>}</section>
    </div><aside className="campaign-rail"><section className="card campaign-summary"><h3>Summary</h3><dl><dt>Post</dt><dd>{post?.title||'Choose a post'}</dd><dt>Platform</dt><dd>{platformChoice==='both'?'Meta + Google Ads':network(platformChoice)}</dd><dt>Goal</dt><dd>{form.goal}</dd><dt>Dates</dt><dd>{showDate(form.startDate)} – {showDate(form.endDate)}</dd><dt>Budget</dt><dd>{money(form)}{platformChoice==='both'?' each':''}</dd><dt>Plans created</dt><dd>{platformChoice==='both'?'2':'1'}</dd><dt>Status</dt><dd>Draft</dd></dl><div className="campaign-ad"><b>BookLender</b><small>Sponsored</small><p>{form.body||'Your ad text will appear here.'}</p>{thumb&&<img src={thumb.url} alt="Selected approved post"/>}<strong>{form.headline||'Your headline'}</strong><span>{form.cta}</span></div><p className="campaign-safe-note">No ad spend starts when you save this plan.</p><button className="btn" disabled={busy||!postId} onClick={()=>void save()}>{busy?'Saving…':platformChoice==='both'?'Save two campaign drafts':'Save campaign draft'}</button><button className="btn ghost" onClick={()=>setView(editing?'detail':'list')}>Cancel</button></section></aside></div>
  </div>;

  if(view==='detail'&&selected) return <div className="campaign-page"><button className="campaign-back" onClick={()=>setView('list')}>‹ &nbsp;Campaigns</button><div className="campaign-title"><div><h2>{selected.payload.name}</h2><p>{network(selected.platform)} · {label(selected.status)}</p></div><span className="chip">{label(selected.status)}</span></div>
    <div className="campaign-detail"><section className="card campaign-step"><h3>Campaign plan</h3><p className="muted">Review the copy, audience, dates and budget before approving.</p><dl className="campaign-facts"><dt>Headline</dt><dd>{selected.payload.headline||'—'}</dd><dt>Ad copy</dt><dd>{selected.payload.body||'—'}</dd><dt>Destination</dt><dd>{selected.payload.url||'—'}</dd><dt>Audience</dt><dd>{selected.payload.location} · {selected.payload.ageMin}–{selected.payload.ageMax} · {selected.platform==='meta'?selected.payload.audience:selected.payload.keywords}</dd><dt>Dates</dt><dd>{selected.payload.startDate} – {selected.payload.endDate}</dd><dt>Budget</dt><dd>{money(selected.payload)}</dd></dl>
      <div className="campaign-actions">{canManage&&<button className="btn ghost" disabled={busy} onClick={()=>edit(selected)}>Edit draft</button>}{canManage&&selected.status==='draft'&&<button className="btn" disabled={busy} onClick={()=>void change('submit')}>Send for review</button>}{canApprove&&selected.status==='review'&&<><button className="btn ok" disabled={busy} onClick={()=>void change('approve')}>Approve plan</button><button className="btn ghost" disabled={busy} onClick={()=>void change('return')}>Return for editing</button></>}{canManage&&<button className="btn ghost" disabled={busy} onClick={()=>void change('archive')}>Archive</button>}</div></section>
      <aside className="card campaign-summary"><h3>Delivery status</h3><p>This is a saved campaign plan. Connecting an ads account and creating the campaign in the ad platform are required before it can run.</p><p className="small muted">Approval here records approval of the plan.</p></aside></div></div>;

  const filtered=campaigns.filter(item=>item.platform===tab);
  return <div className="campaign-page campaign-dashboard">
    <div className="campaign-account-toolbar"><label><span>Ad account</span><select value={selectedAdsAccount} disabled={!adOptions.length||checking} onChange={event=>setSelectedAdsAccount(event.target.value)}><option value="">{checking?'Loading accounts…':adOptions.length?'Choose an account':`No usable ${network(tab)} ad account`}</option>{adOptions.map(option=><option key={option.key} value={option.key}>{option.connectionName} · {option.name}{option.currency?` · ${option.currency}`:''}</option>)}</select></label><span className="campaign-account-caption">{activeAdOption?activeAdOption.name:'Select a connected advertising account'}</span><button className="btn ghost sm" disabled={!activeAdOption||syncing} onClick={()=>activeAdOption&&void refreshAnalytics(activeAdOption,period)}>{syncing?'Syncing…':'Sync analytics'}</button></div>
    <div className="campaign-notice"><Icon name="plug"/><span>Campaign plans are saved in BookLender. Live ad delivery and reporting are pending.{connections&&<span className="campaign-connection-result">{connections.connections.length ? connections.connections.map((item,index)=><span key={index}><b>{item.name} · {network(item.platform)}:</b> {item.status==='available'?`${item.accounts.filter(a=>a.selectable).length} ad account(s) available`:item.status==='no_accounts'?'No usable ad account found':item.status==='access_denied'?'Ads access denied':'Could not verify'}.</span>) : 'No Meta or Google Ads connections found.'}</span>}</span><button className="btn ghost sm" disabled={checking} onClick={()=>void checkConnections()}>{checking?'Checking…':'Check ads connections'}</button></div>
    <div className="campaign-title"><div><h2><em>{queue.length} {queue.length===1?'campaign waits':'campaigns wait'} for approval.</em> {campaigns.length} plans in BookLender.</h2><p>Review campaign plans from approved posts.</p></div>{canManage&&<button className="btn" onClick={newDraft}><Icon name="spark"/> New campaign from a post</button>}</div>
    {queue.length>0&&<section className="campaign-approval"><header><Icon name="eye"/><b>{queue.length} {queue.length===1?'campaign needs':'campaigns need'} approval.</b><span>Approval confirms the plan; it does not start ad spend.</span></header>{queue.map(item=>{const source=state.posts.find(p=>p.id===item.postId);const image=preview(source);return <div className="campaign-approval-row" key={item.id}>{image?<img src={image} alt=""/>:<span className="campaign-media-fallback"><Icon name="image"/></span>}<div><b>{item.payload.name}</b><small>{network(item.platform)} · {showDate(item.payload.startDate)} – {showDate(item.payload.endDate)} · {money(item.payload)}</small></div><button className="btn sm" onClick={()=>{setSelected(item);setView('detail');}}>Review</button></div>})}</section>}
    <div className="campaign-bar"><div className="campaign-tabs">{(['meta','google'] as const).map(item=><button key={item} className={tab===item?'on':''} onClick={()=>setTab(item)}><span className={`campaign-platform-mark ${item}`}>{item==='meta'?'M':'G'}</span>{network(item)}</button>)}</div><div className="campaign-periods">{([7,30,90] as const).map(days=><button key={days} className={period===days?'on':''} onClick={()=>setPeriod(days)}>{days} days</button>)}</div></div>
    <div className="campaign-metrics">{(tab==='meta'?[['Spend',formatMoney(totals.spend)],['Results',totals.conversions.toLocaleString()],['Cost per result',totals.conversions?formatMoney(costPerResult):'—'],['CTR (link)',`${ctr.toFixed(2)}%`],['CPM',formatMoney(cpm)],['ROAS',roas?`${roas.toFixed(2)}×`:'—']]:[['Spend',formatMoney(totals.spend)],['Conversions',totals.conversions.toLocaleString()],['Cost per conversion',totals.conversions?formatMoney(costPerResult):'—'],['CTR',`${ctr.toFixed(2)}%`],['Avg. CPC',formatMoney(cpc)],['ROAS',roas?`${roas.toFixed(2)}×`:'—']]).map(([metric,value])=><div className="card campaign-metric" key={metric}><span>{metric}</span><b>{syncing?'…':analytics?.rows.length?value:'—'}</b><small>{analytics?.rows.length?`${network(tab)} · last ${period} days`:analytics?.backfillPending?'Zernio backfill in progress':activeAdOption?'No reporting rows for this period':'Select an ad account to sync'}</small></div>)}</div>
    <div className="card campaign-secondary">{(tab==='meta'?[['Reach',totals.reach.toLocaleString()],['Impressions',totals.impressions.toLocaleString()],['Frequency',totals.reach?(totals.impressions/totals.reach).toFixed(2):'—'],['CPC (link)',formatMoney(cpc)]]:[['Impressions',totals.impressions.toLocaleString()],['Clicks',totals.clicks.toLocaleString()],['Conversion rate',totals.clicks?`${(totals.conversions/totals.clicks*100).toFixed(2)}%`:'—'],['Impression share','—']]).map(([metric,value])=><div key={metric}><span>{metric}</span><b>{analytics?.rows.length?value:'—'}</b></div>)}</div>
    <section className="card campaign-chart"><h3>{tab==='meta'?'Spend and results by day':'Spend and conversions by day'}</h3><p>{activeAdOption?`${activeAdOption.name} · last ${period} days`:'Select an account to view daily activity'}</p><div className="campaign-chart-body"><div className="campaign-chart-grid"/>{analytics?.rows.length?<div className="campaign-daily-bars">{analytics.rows.map(row=><div className="campaign-daily-column" key={row.date} title={`${row.date} · ${formatMoney(row.spend||0)} · ${row.conversions||0} results`}><i style={{height:`${Math.max(2,Math.min(100,(row.spend||0)/Math.max(1,...analytics.rows.map(item=>item.spend||0))*100))}%`}}/><span>{new Date(`${row.date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span></div>)}</div>:<div className="campaign-chart-message"><Icon name="chart"/><b>{syncing?'Syncing account analytics…':analytics?.backfillPending?'Historical data is still syncing':'No ad performance data yet'}</b><span>{analytics?.backfillPending?'Zernio is importing this account’s history. Refresh again after it completes.':'Choose an ad account and sync its latest reporting from Zernio.'}</span></div>}</div></section>
    <section className="campaign-table-section"><div className="campaign-list-head"><h3>{network(tab)} campaigns</h3><span className="small muted">{filtered.length} {filtered.length===1?'plan':'plans'}</span></div><div className="card campaign-list">{loading?<p className="muted">Loading campaigns…</p>:filtered.length?<div className="tblwrap"><table className="tbl"><thead><tr><th>Campaign</th><th>Status</th><th>Dates</th><th>Budget</th><th>Results</th><th>Cost / result</th><th>CTR</th><th></th></tr></thead><tbody>{filtered.map(item=>{const source=state.posts.find(p=>p.id===item.postId);const image=preview(source);return <tr key={item.id}><td><div className="campaign-table-name">{image?<img src={image} alt=""/>:<span className="campaign-media-fallback"><Icon name="image"/></span>}<span><b>{item.payload.name}</b><small>From post · {source?.title||'Approved post'}</small></span></div></td><td><span className={`chip ${item.status==='review'?'amber':item.status==='approved'?'green':''}`}>{label(item.status)}</span></td><td>{showDate(item.payload.startDate)} – {showDate(item.payload.endDate)}</td><td>{money(item.payload)}</td><td>—</td><td>—</td><td>—</td><td><button className={`btn ${item.status==='review'?'':'ghost'} sm`} onClick={()=>{setSelected(item);setView('detail');}}>{item.status==='review'?'Review':'View'}</button></td></tr>})}</tbody></table></div>:<div className="campaign-empty"><Icon name="flag"/><b>No {network(tab)} campaign plans yet</b><span>Create a campaign from an approved post to get started.</span></div>}</div></section>
  </div>;
}
