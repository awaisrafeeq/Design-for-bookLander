'use client';
import { useCallback, useEffect, useState } from 'react';
import { studioApi, type Campaign, type CampaignPayload, type CampaignConnections } from '../api';
import { useStudio } from '../components/StudioProvider';
import { Icon } from '../components/Icon';

const day = () => new Date().toISOString().slice(0, 10);
const initial = (): CampaignPayload => ({name:'',goal:'traffic',budgetType:'daily',budget:'',startDate:day(),endDate:day(),url:'',headline:'',body:'',keywords:'',audience:'',location:'United States',ageMin:18,ageMax:65,cta:'Learn more',platform:'meta'});
const label = (status: string) => ({draft:'Draft',review:'Awaiting review',approved:'Plan approved'}[status] || status);
const network = (value: string) => value === 'meta' ? 'Meta' : 'Google Ads';

export default function CampaignsPage() {
  const {state, notify} = useStudio();
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [view,setView]=useState<'list'|'edit'|'detail'>('list');
  const [tab,setTab]=useState<'meta'|'google'>('meta');
  const [form,setForm]=useState<CampaignPayload>(initial);
  const [postId,setPostId]=useState<number | null>(null);
  const [editing,setEditing]=useState<Campaign | null>(null);
  const [selected,setSelected]=useState<Campaign | null>(null);
  const [instructions,setInstructions]=useState('');
  const [connections,setConnections]=useState<CampaignConnections | null>(null);
  const [checking,setChecking]=useState(false);
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
  const newDraft=()=>{setEditing(null);setPostId(null);setForm(initial());setView('edit');};
  const choosePost=(id:number)=>{const item=state.posts.find(p=>p.id===id);setPostId(id);if(item&&!editing)setForm(current=>({...current,name:item.title,headline:item.title.slice(0,180),body:item.caption||''}));};
  const edit=(item:Campaign)=>{setEditing(item);setPostId(item.postId);setForm(item.payload);setView('edit');};
  const save=async()=>{const result=await action(editing?{action:'update',id:editing.id,payload:form}:{action:'create',postId,platform:form.platform,payload:form});if(result){setSelected(result);setView('detail');}};
  const generate=async()=>{
    if(!postId)return;
    setBusy(true);
    try {
      const result=await studioApi.act<{message:string;headline:string;body:string}>('campaigns',{action:'generate-copy',postId,platform:form.platform,instructions});
      setForm(current=>({...current,headline:result.headline,body:result.body}));notify(result.message);
    } catch(error){notify((error as Error).message,true);} finally{setBusy(false);}
  };
  const checkConnections=async()=>{setChecking(true);try{setConnections(await studioApi.campaignConnections());}catch(error){notify((error as Error).message,true);}finally{setChecking(false);}};
  const change=async(name:string)=>{if(!selected)return;const result=await action({action:name,id:selected.id});if(result){setSelected(result);if(name==='archive')setView('list');}};
  const count=(status:string)=>campaigns.filter(item=>item.status===status).length;
  const money=(p:CampaignPayload)=>p.budget ? `$${Number(p.budget).toLocaleString()} ${p.budgetType==='daily'?'per day':'total'}` : 'Not set';
  const thumb=post?.media?.find(item=>item.type==='image');

  if(view==='edit') return <div className="campaign-page">
    <button className="campaign-back" onClick={()=>setView(editing?'detail':'list')}>‹ &nbsp;Campaigns</button>
    <div className="campaign-title"><div><h2>{editing?'Edit campaign plan':'Turn a post into a campaign'}</h2><p>Build an ad plan from an approved post and send it for review.</p></div></div>
    <div className="campaign-create"><div className="campaign-steps">
      <section className="card campaign-step"><div className="campaign-step-title"><i>1</i><div><h3>Choose the post</h3><p>Only approved posts with media are available.</p></div></div>
        {approved.length?<div className="campaign-post-grid">{approved.map(item=><button key={item.id} type="button" className={postId===item.id?'chosen':''} onClick={()=>choosePost(item.id)} disabled={Boolean(editing)}>{item.media?.[0]?.type==='image'&&<img src={item.media[0].url} alt=""/>}<span><b>{item.title}</b><small>Approved v{item.version} · {item.format}</small></span></button>)}</div>:<p className="muted">Approve a post with media in Review first.</p>}
      </section>
      <section className="card campaign-step"><div className="campaign-step-title"><i>2</i><div><h3>Where it runs</h3><p>Choose one platform for this plan.</p></div></div><div className="campaign-options">{(['meta','google'] as const).map(value=><button key={value} type="button" className={form.platform===value?'chosen':''} disabled={Boolean(editing)} onClick={()=>set('platform',value)}><b>{network(value)}</b><small>{value==='meta'?'Facebook and Instagram':'Google Search'}</small></button>)}</div><label>Goal<select value={form.goal} onChange={e=>set('goal',e.target.value)}><option value="traffic">Website traffic</option><option value="awareness">Awareness</option><option value="engagement">Engagement</option></select></label></section>
      <section className="card campaign-step"><div className="campaign-step-title"><i>3</i><div><h3>Ad copy</h3><p>Edit the text and destination for this campaign.</p></div></div>
        <div className="campaign-ai"><label>Instructions for AI <span className="muted">(optional)</span><input value={instructions} maxLength={1000} onChange={e=>setInstructions(e.target.value)} placeholder="For example: focus on weekend reading"/></label><button type="button" className="btn ghost" disabled={busy||!postId} onClick={()=>void generate()}><Icon name="spark"/> {busy?'Working…':'Generate copy'}</button></div>
        <label>Campaign name<input value={form.name} maxLength={180} onChange={e=>set('name',e.target.value)}/></label>
        <label>Headline<input value={form.headline} maxLength={180} onChange={e=>set('headline',e.target.value)}/></label>
        <label>Primary text<textarea rows={4} value={form.body} maxLength={5000} onChange={e=>set('body',e.target.value)}/></label>
        <div className="campaign-fields"><label>Destination URL<input type="url" placeholder="https://..." value={form.url} onChange={e=>set('url',e.target.value)}/></label><label>Button<select value={form.cta} onChange={e=>set('cta',e.target.value)}><option>Learn more</option><option>Shop now</option><option>Sign up</option><option>Get offer</option></select></label></div>
      </section>
      <section className="card campaign-step"><div className="campaign-step-title"><i>4</i><div><h3>Audience and keywords</h3><p>Describe the audience you want to reach.</p></div></div><div className="campaign-fields"><label>Location<input value={form.location} onChange={e=>set('location',e.target.value)}/></label><label>{form.platform==='meta'?'Interests':'Search keywords'}<textarea rows={2} value={form.platform==='meta'?form.audience:form.keywords} onChange={e=>set(form.platform==='meta'?'audience':'keywords',e.target.value)} placeholder="Separate with commas"/></label><label>Minimum age<input type="number" min={18} max={65} value={form.ageMin} onChange={e=>set('ageMin',Number(e.target.value))}/></label><label>Maximum age<input type="number" min={18} max={65} value={form.ageMax} onChange={e=>set('ageMax',Number(e.target.value))}/></label></div></section>
      <section className="card campaign-step"><div className="campaign-step-title"><i>5</i><div><h3>Dates and budget</h3><p>Set the proposed dates and budget for review.</p></div></div><div className="campaign-fields"><label>Start date<input type="date" value={form.startDate} onChange={e=>set('startDate',e.target.value)}/></label><label>End date<input type="date" value={form.endDate} onChange={e=>set('endDate',e.target.value)}/></label><label>Budget type<select value={form.budgetType} onChange={e=>set('budgetType',e.target.value)}><option value="daily">Daily</option><option value="lifetime">Total</option></select></label><label>Budget (USD)<input type="number" min="0.01" step="0.01" value={form.budget} onChange={e=>set('budget',e.target.value)}/></label></div></section>
    </div><aside className="campaign-rail"><section className="card campaign-preview"><h3>Ad preview</h3><span className="small muted">{network(form.platform)} · Example layout</span><div className="campaign-ad"><b>BookLender</b><small>Sponsored</small><p>{form.body||'Your ad text will appear here.'}</p>{thumb&&<img src={thumb.url} alt="Selected approved post"/>}<strong>{form.headline||'Your headline'}</strong><span>{form.cta}</span></div></section><section className="card campaign-summary"><h3>Summary</h3><dl><dt>Post</dt><dd>{post?.title||'Choose a post'}</dd><dt>Platform</dt><dd>{network(form.platform)}</dd><dt>Dates</dt><dd>{form.startDate} – {form.endDate}</dd><dt>Budget</dt><dd>{money(form)}</dd><dt>Status</dt><dd>Draft</dd></dl><button className="btn" disabled={busy||!postId} onClick={()=>void save()}>{busy?'Saving…':'Save campaign draft'}</button><button className="btn ghost" onClick={()=>setView(editing?'detail':'list')}>Cancel</button></section></aside></div>
  </div>;

  if(view==='detail'&&selected) return <div className="campaign-page"><button className="campaign-back" onClick={()=>setView('list')}>‹ &nbsp;Campaigns</button><div className="campaign-title"><div><h2>{selected.payload.name}</h2><p>{network(selected.platform)} · {label(selected.status)}</p></div><span className="chip">{label(selected.status)}</span></div>
    <div className="campaign-detail"><section className="card campaign-step"><h3>Campaign plan</h3><p className="muted">Review the copy, audience, dates and budget before approving.</p><dl className="campaign-facts"><dt>Headline</dt><dd>{selected.payload.headline||'—'}</dd><dt>Ad copy</dt><dd>{selected.payload.body||'—'}</dd><dt>Destination</dt><dd>{selected.payload.url||'—'}</dd><dt>Audience</dt><dd>{selected.payload.location} · {selected.payload.ageMin}–{selected.payload.ageMax} · {selected.platform==='meta'?selected.payload.audience:selected.payload.keywords}</dd><dt>Dates</dt><dd>{selected.payload.startDate} – {selected.payload.endDate}</dd><dt>Budget</dt><dd>{money(selected.payload)}</dd></dl>
      <div className="campaign-actions">{canManage&&<button className="btn ghost" disabled={busy} onClick={()=>edit(selected)}>Edit draft</button>}{canManage&&selected.status==='draft'&&<button className="btn" disabled={busy} onClick={()=>void change('submit')}>Send for review</button>}{canApprove&&selected.status==='review'&&<><button className="btn ok" disabled={busy} onClick={()=>void change('approve')}>Approve plan</button><button className="btn ghost" disabled={busy} onClick={()=>void change('return')}>Return for editing</button></>}{canManage&&<button className="btn ghost" disabled={busy} onClick={()=>void change('archive')}>Archive</button>}</div></section>
      <aside className="card campaign-summary"><h3>Delivery status</h3><p>This is a saved campaign plan. Connecting an ads account and creating the campaign in the ad platform are required before it can run.</p><p className="small muted">Approval here records approval of the plan.</p></aside></div></div>;

  const filtered=campaigns.filter(item=>item.platform===tab);
  return <div className="campaign-page"><div className="campaign-title"><div><h2>Campaigns at a glance</h2><p>Plan and review paid campaigns from your approved content.</p></div>{canManage&&<button className="btn" onClick={newDraft}><Icon name="plus"/> New campaign</button>}</div>
    <div className="campaign-notice"><Icon name="plug"/><span>Campaign plans are saved in BookLender. Ads delivery and performance are not available in this view yet.{connections&&<span className="campaign-connection-result">{connections.connections.length ? connections.connections.map((item,index)=><span key={index}><b>{item.name} · {network(item.platform)}:</b> {item.status==='available'?`${item.accounts.filter(a=>a.selectable).length} ad account(s) available`:item.status==='no_accounts'?'No usable ad account found':item.status==='access_denied'?'Ads access denied':'Could not verify'}.</span>) : 'No Meta or Google Ads connections found.'}</span>}</span><button className="btn ghost sm" disabled={checking} onClick={()=>void checkConnections()}>{checking?'Checking…':'Check ads connections'}</button></div>
    <div className="campaign-kpis"><div className="card"><span>Drafts</span><b>{count('draft')}</b></div><div className="card"><span>Awaiting review</span><b>{count('review')}</b></div><div className="card"><span>Plans approved</span><b>{count('approved')}</b></div><div className="card"><span>Ad spend</span><b>—</b><small>Available after ads connection</small></div></div>
    {count('review')>0&&<div className="campaign-queue"><Icon name="eye"/><span><b>{count('review')} campaign {count('review')===1?'plan is':'plans are'} waiting for review.</b> Open a campaign to review its details.</span></div>}
    <div className="campaign-bar"><div className="campaign-tabs">{(['meta','google'] as const).map(item=><button key={item} className={tab===item?'on':''} onClick={()=>setTab(item)}>{network(item)}</button>)}</div><span className="small muted">Campaign plans</span></div>
    <section className="card campaign-list"><div className="campaign-list-head"><h3>{network(tab)} campaigns</h3><span className="small muted">{filtered.length} plans</span></div>{loading?<p className="muted">Loading campaigns…</p>:filtered.length?<div className="tblwrap"><table className="tbl"><thead><tr><th>Campaign</th><th>Status</th><th>Dates</th><th>Budget</th><th></th></tr></thead><tbody>{filtered.map(item=><tr key={item.id}><td><b>{item.payload.name}</b><small>{state.posts.find(p=>p.id===item.postId)?.title||'Approved post'}</small></td><td><span className="chip">{label(item.status)}</span></td><td>{item.payload.startDate} – {item.payload.endDate}</td><td>{money(item.payload)}</td><td><button className="btn ghost sm" onClick={()=>{setSelected(item);setView('detail');}}>View</button></td></tr>)}</tbody></table></div>:<div className="campaign-empty"><Icon name="flag"/><b>No {network(tab)} campaign plans yet</b><span>Create a campaign from an approved post to get started.</span></div>}</section>
  </div>;
}
