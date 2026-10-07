'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { StudioProvider, useStudio } from './StudioProvider';
import { Icon } from './Icon';
import { DueChip, FormatChip, Media, Meter, PlatformChip, SourceChip, Who, money } from './Design';
import { used } from '../domain';
import type { Post } from '../types';
import { ContentEditor } from './ContentEditor';
import { ScheduleComposer } from './Scheduling';
import { usePostVersion, VersionPicker } from './PostVersions';

const groups: { title: string; links: [string,string,string,string][] }[] = [
  { title: 'Work', links: [['today','home','Today','/'],['board','board','Board','/board'],['ideas','bulb','Ideas','/ideas'],['review','eye','Review','/review'],['schedule','cal','Schedule','/schedule'],['results','chart','Results','/results']] },
  { title: 'Set up', links: [['sources','zap','Sources & events','/sources'],['brand','brush','Brand & styles','/brand'],['spend','dollar','AI spend','/spend'],['team','users','Team & roles','/team']] },
  { title: 'Support', links: [['logs','list','Logs','/logs'],['help','help','Help','/help'],['profile','users','Profile','/profile']] },
];

function PostDrawer({ post }: { post: Post }) {
  const { state, openPost, command, pending } = useStudio();
  const { shown, historical, selected, setSelected } = usePostVersion(post);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') openPost(null); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [openPost]);
  const stage = shown.stage === 'published' ? 'Published' : shown.stage === 'archived' ? 'Archive' : shown.stage[0].toUpperCase() + shown.stage.slice(1);
  const act = (action: string) => { void command('posts',{action,id:post.id,version:post.version}).then(ok=>{if(ok)openPost(null)}); };
  return <><div className="scrim" onClick={() => openPost(null)}/><aside className="drawer" role="dialog" aria-modal="true" aria-label={post.title}><div className="dh"><span className="chip">{stage}</span>{post.stage !== 'archived' && post.stage !== 'published' && <Who kind={post.stage === 'idea' || post.stage === 'revision' ? 'both' : post.stage === 'selected' || post.stage === 'review' ? 'team' : post.stage === 'scheduled' ? 'auto' : 'ai'}/>}<button className="iconbtn x" onClick={() => openPost(null)} aria-label="Close"><Icon name="x"/></button></div>
    {(shown.media?.length || ['generating','revision'].includes(shown.stage)) ? <div className={`prev ${['generating','revision'].includes(shown.stage) ? 'processing' : shown.format === 'video' ? 'video':'sq'}`}><Media post={shown}/></div> : null}
    <h2>{shown.title}</h2><div className="ft" style={{display:'flex',gap:6,flexWrap:'wrap'}}><SourceChip post={shown}/><FormatChip post={shown}/><PlatformChip post={shown}/><DueChip post={shown}/></div>
    {shown.reason && <div className="why"><Icon name={shown.human ? 'user':'spark'}/><span><small>{shown.human ? 'Added by a person' : 'Why AI suggested it'}</small>{shown.reason}{shown.event ? ` · ${shown.event}`:''}</span></div>}
    {shown.error && <dl className="fixbox"><dt>Problem</dt><dd>{shown.error}</dd><dt>Fix</dt><dd>Open Logs for the cause, recommended fix and retry options.</dd></dl>}
    <VersionPicker post={post} selected={selected} onChange={setSelected}/>
    {historical ? <ContentEditor key={`history-${shown.version}`} post={shown} readOnly/> : ['selected','review'].includes(post.stage) ? <ContentEditor key="current" post={post}/> : (post.caption || post.mediaBrief || post.script) ? <ContentEditor key="current-readonly" post={post} readOnly/> : post.note ? <div className="notepill"><Icon name="user"/><span>{post.note}</span></div> : null}
    {!historical && ['review','scheduled'].includes(post.stage) && post.media?.length && state.modules?.includes('Schedule') && <ScheduleComposer post={post}/>}
    {historical && shown.scheduledAt && <p className="small muted">Saved posting slot: {new Date(shown.scheduledAt).toLocaleString('en-US',{timeZone:'America/New_York'})} ET</p>}
    {!historical && <div className="dact">{post.stage === 'idea' && <><button className="btn ghost" disabled={pending} onClick={()=>act('skip')}><Icon name="x"/>Skip</button><button className="btn" disabled={pending} onClick={()=>act('pick')}><Icon name="check"/>Pick</button></>}{post.stage === 'scheduled' && state.permissions?.['content.edit'] && <button className="btn ghost" disabled={pending} onClick={()=>act('reopen')}>Reopen for editing</button>}{post.stage === 'selected' && <button className="btn ghost" disabled={pending} onClick={()=>act('unpick')}>Back to Ideas</button>}{post.stage === 'review' && <Link className="btn" href={`/review?post=${post.id}`} onClick={()=>openPost(null)}><Icon name="eye"/>Open in Review</Link>}{post.stage === 'archived' && <button className="btn ghost" disabled={pending} onClick={()=>act('restore')}><Icon name="retry"/>Reactivate</button>}</div>}
  </aside></>;
}

function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const { state, drawerId, openPost } = useStudio(); const [more, setMore] = useState(false);
  const title = groups.flatMap(group=>group.links).find(item=>item[3]===pathname)?.[2] || 'Today';
  const review = state.posts.filter(post=>post.stage==='review' && post.approvedVersion !== post.version).length;
  const reviewQueue = state.posts.filter(post=>post.stage==='review').length;
  const errors = state.posts.filter(post=>post.error).length;
  const ideas = state.posts.filter(post=>post.stage==='idea').length;
  const unresolved = state.activity.filter(item=>item.level==='error'&&!item.done).length;
  const badge = (id:string) => id === 'review' && reviewQueue ? <span className="bd need">{reviewQueue}</span> : id === 'logs' && unresolved ? <span className="bd err">{unresolved}</span> : id === 'ideas' && ideas ? <span className="bd ai">{ideas}</span> : null;
  useEffect(() => { setMore(false); openPost(null); }, [pathname,openPost]);
  const switchTheme = () => { const root = document.documentElement; root.dataset.theme = getComputedStyle(root).colorScheme.includes('dark') ? 'light':'dark'; };
  const signOut = async () => {
    try {
      const csrfResponse = await fetch('/api/auth/csrf', { cache: 'no-store' });
      const { csrf_token } = await csrfResponse.json() as { csrf_token?: string };
      if (csrf_token) await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrf_token } });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  };
  const moduleNames: Record<string, string> = { board: 'Board', ideas: 'Ideas', review: 'Review', schedule: 'Schedule', results: 'Results', sources: 'Sources', brand: 'Brand', spend: 'AI spend', team: 'Team', logs: 'Logs' };
  const visibleGroups = groups.map(group=>({...group, links:group.links.filter(([id])=>!moduleNames[id] || state.modules?.includes(moduleNames[id]))}));
  const canView = visibleGroups.some(group=>group.links.some(link=>link[3]===pathname));
  const tabs = visibleGroups[0].links.filter(item=>['today','board','review','schedule'].includes(item[0]));
  return <div className="shell"><div className="app"><aside className="side" aria-label="Main navigation"><Link href="/" className="logo"><span className="mk"><Icon name="book"/></span><span><b>BookLender</b><small>Marketing studio</small></span></Link>{visibleGroups.map(group=><div className="grp" key={group.title}><span>{group.title}</span>{group.links.map(([id,icon,label,href])=><Link key={id} className={`nv ${pathname === href ? 'on':''}`} href={href} aria-current={pathname === href ? 'page' : undefined}><Icon name={icon}/>{label}{badge(id)}</Link>)}</div>)}<div className="sidefoot"><div className="row"><b style={{color:'var(--ink)'}}>AI today</b><span className="num">{money(used(state))} / ${state.spend.cap}</span></div><Meter/><div className="row"><span><i className="dot"/>Running</span><span>Manual topics</span></div></div></aside><div className="main"><header className="top"><h1>{title}</h1><div className="hr">{review > 0 && <Link className="pill need" href="/review"><Icon name="eye"/>{review}<span className="lbl">&nbsp;to approve</span></Link>}{errors > 0 && <Link className="pill err" href="/logs"><Icon name="alert"/>{errors}<span className="lbl">&nbsp;error</span></Link>}<Link className="pill ai" href="/spend"><Icon name="spark"/><span className="num">{money(used(state))}</span><span className="lbl">&nbsp;of ${state.spend.cap}</span></Link><Link className="btn ghost sm" href="/profile">Profile</Link><button className="btn ghost sm" onClick={()=>void signOut()}>Sign out</button><button className="iconbtn" onClick={switchTheme} aria-label="Switch light or dark"><Icon name="moon"/></button></div></header><main className="page">{canView ? children : <section className="card pad">Your account does not have access to this page.</section>}</main></div></div>
    <nav className="tabbar" aria-label="Main">{tabs.map(([id,icon,label,href])=><Link key={id} className={pathname===href?'on':''} href={href} onClick={()=>setMore(false)}><Icon name={icon}/>{label}{badge(id)}</Link>)}<button className={!tabs.some(item=>item[3]===pathname)?'on':''} onClick={()=>setMore(true)}><Icon name="menu"/>More{badge('logs')}</button></nav>
    {more && <><div className="scrim" onClick={()=>setMore(false)}/><div className="sheet" role="dialog" aria-label="More"><span className="grab"/>{visibleGroups.flatMap(group=>group.links).filter(item=>!tabs.some(tab=>tab[0]===item[0])).map(([id,icon,label,href])=><Link key={id} href={href} onClick={()=>setMore(false)}><Icon name={icon}/>{label}{badge(id)}</Link>)}</div></>}
    {drawerId != null && state.posts.find(post=>post.id===drawerId) && <PostDrawer post={state.posts.find(post=>post.id===drawerId)!}/>}
  </div>;
}
export function Shell({ children }: { children: React.ReactNode }) { return <StudioProvider><ShellContent>{children}</ShellContent></StudioProvider>; }
