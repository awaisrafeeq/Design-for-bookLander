'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { StudioProvider, useStudio } from './StudioProvider';
import { Icon } from './Icon';
import { Cover, DueChip, FormatChip, Media, Meter, PlatformChip, SourceChip, Who, money } from './Design';
import { dayLabel, formats, getBook, used } from '../domain';
import type { Post } from '../types';

const groups: { title: string; links: [string,string,string,string][] }[] = [
  { title: 'Work', links: [['today','home','Today','/'],['board','board','Board','/board'],['ideas','bulb','Ideas','/ideas'],['review','eye','Review','/review'],['schedule','cal','Schedule','/schedule'],['results','chart','Results','/results']] },
  { title: 'Set up', links: [['sources','zap','Sources & events','/sources'],['brand','brush','Brand & styles','/brand'],['spend','dollar','AI spend','/spend'],['team','users','Team & roles','/team']] },
  { title: 'Support', links: [['logs','list','Logs','/logs'],['help','help','Help','/help'],['profile','users','Profile','/profile']] },
];

function PostDrawer({ post }: { post: Post }) {
  const { state, openPost, command, pending } = useStudio(); const book = getBook(state,post.bookId);
  const [caption, setCaption] = useState(post.caption || ''); const [tags, setTags] = useState(post.tags || '');
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') openPost(null); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [openPost]);
  useEffect(() => { setCaption(post.caption || ''); setTags(post.tags || ''); }, [post.id, post.version, post.caption, post.tags]);
  const stage = post.stage === 'published' ? 'Published' : post.stage === 'archived' ? 'Archive' : post.stage[0].toUpperCase() + post.stage.slice(1);
  const made = ['review','scheduled','published'].includes(post.stage) || (post.stage === 'revision' && post.caption);
  const act = (action: string) => { void command('posts',{action,id:post.id}).then(ok=>{if(ok)openPost(null)}); };
  return <><div className="scrim" onClick={() => openPost(null)}/><aside className="drawer" role="dialog" aria-modal="true" aria-label={post.title}><div className="dh"><span className="chip">{stage}</span>{post.stage !== 'archived' && post.stage !== 'published' && <Who kind={post.stage === 'idea' || post.stage === 'revision' ? 'both' : post.stage === 'selected' || post.stage === 'review' ? 'team' : post.stage === 'scheduled' ? 'auto' : 'ai'}/>}<button className="iconbtn x" onClick={() => openPost(null)} aria-label="Close"><Icon name="x"/></button></div>
    {made ? <div className={`prev ${post.format === 'video' ? 'video':'sq'}`}><Media post={post}/></div> : ['generating','revision'].includes(post.stage) ? <div className="prev none"><Who kind="ai"/><div style={{gridColumn:'1/-1',width:'100%'}}><div className="prog"><i style={{width:`${post.progress || 20}%`}}/></div></div></div> : <div className="prev none"><Cover bookId={post.bookId}/><span><b>Not made yet</b><br/><span className="small muted">Only picked ideas are made. The real cost shows once it is ready.</span></span></div>}
    <h2>{post.title}</h2><div className="ft" style={{display:'flex',gap:6,flexWrap:'wrap'}}><SourceChip post={post}/><FormatChip post={post}/><PlatformChip post={post}/><DueChip post={post}/></div>
    {post.reason && <div className="why"><Icon name={post.human ? 'user':'spark'}/><span><small>{post.human ? 'Added by a person' : 'Why AI suggested it'}</small>{post.reason}{post.event ? ` · ${post.event}`:''}</span></div>}
    {post.error && <dl className="fixbox"><dt>Problem</dt><dd>{post.error}</dd><dt>Fix</dt><dd>Reconnect, and it retries by itself.</dd></dl>}
    <div className="bookrow"><Cover bookId={post.bookId}/><span><b style={{display:'block'}}>{book.title}</b><span className="small muted">{book.author} · {book.format || ''}</span></span>{book.stock && <span className="chip green" style={{marginLeft:'auto'}}><Icon name="check"/>{book.stock} in stock</span>}</div>
    <dl className="kv">{post.day != null && <><dt>Posts</dt><dd>{dayLabel(post.day)} · {post.time}</dd></>}{post.approvedBy && <><dt>Approved by</dt><dd>{post.approvedBy}</dd></>}<dt>{post.human ? 'Draft by' : 'Made with'}</dt><dd>{post.human ? 'BookLender team' : `${formats[post.format].tool}, OpenRouter`}</dd>{post.cost && <><dt>AI cost</dt><dd>{money(post.cost)}</dd></>}{post.reach && <><dt>Reach</dt><dd>{post.reach.toLocaleString()}</dd><dt>Engagement rate</dt><dd>{post.engagement}%</dd><dt>Link clicks</dt><dd>{post.clicks}</dd><dt>Saves</dt><dd>{post.saves}</dd></>}{post.archiveReason && <><dt>Why here</dt><dd>{post.archiveReason}</dd></>}</dl>
    {post.history?.map(item=><div className="hist" key={item.version}><b>v{item.version} sent back · {item.reason}</b>{item.note && <><br/>“{item.note}”</>}</div>)}
    {post.stage === 'selected' && <section className="card pad sec"><b>Draft caption</b><textarea rows={5} value={caption} onChange={event=>setCaption(event.target.value)} placeholder="Write a caption to send for review" aria-label="Draft caption"/><input value={tags} onChange={event=>setTags(event.target.value)} placeholder="Hashtags (optional)" aria-label="Hashtags"/><button className="btn" disabled={pending || !caption.trim()} onClick={()=>void command('posts',{action:'update',id:post.id,version:post.version,caption,tags})}><Icon name="check"/>Save draft for review</button></section>}
    <div className="dact">{post.stage === 'idea' && <><button className="btn ghost" disabled={pending} onClick={()=>act('skip')}><Icon name="x"/>Skip</button><button className="btn" disabled={pending} onClick={()=>act('pick')}><Icon name="check"/>Pick</button></>}{post.stage === 'selected' && <><button className="btn ghost" disabled={pending} onClick={()=>act('unpick')}>Back to Ideas</button><button className="btn ai" disabled={pending} onClick={()=>act('generate')}><Icon name="spark"/>Generate with AI</button></>}{post.stage === 'review' && <Link className="btn" href={`/review?post=${post.id}`} onClick={()=>openPost(null)}><Icon name="eye"/>Open in Review</Link>}{post.stage === 'scheduled' && post.error && <button className="btn" disabled={pending} onClick={()=>void command('sources',{action:'reconnect',key:post.platform==='Instagram'?'ig':'fb'}).then(()=>openPost(null))}><Icon name="plug"/>Reconnect {post.platform}</button>}{post.stage === 'archived' && <button className="btn ghost" disabled={pending} onClick={()=>act('restore')}><Icon name="retry"/>Reactivate</button>}</div>
  </aside></>;
}

function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const { state, drawerId, openPost } = useStudio(); const [more, setMore] = useState(false);
  const title = groups.flatMap(group=>group.links).find(item=>item[3]===pathname)?.[2] || 'Today';
  const review = state.posts.filter(post=>post.stage==='review').length;
  const errors = state.posts.filter(post=>post.error).length;
  const ideas = state.posts.filter(post=>post.stage==='idea').length;
  const unresolved = state.activity.filter(item=>item.level==='error'&&!item.done).length;
  const badge = (id:string) => id === 'review' && review ? <span className="bd need">{review}</span> : id === 'logs' && unresolved ? <span className="bd err">{unresolved}</span> : id === 'ideas' && ideas ? <span className="bd ai">{ideas}</span> : null;
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
  const tabs = groups[0].links.filter(item=>['today','board','review','schedule'].includes(item[0]));
  return <div className="shell"><div className="app"><aside className="side" aria-label="Main navigation"><Link href="/" className="logo"><span className="mk"><Icon name="book"/></span><span><b>BookLender</b><small>Marketing studio</small></span></Link>{groups.map(group=><div className="grp" key={group.title}><span>{group.title}</span>{group.links.map(([id,icon,label,href])=><Link key={id} className={`nv ${pathname === href ? 'on':''}`} href={href} aria-current={pathname === href ? 'page' : undefined}><Icon name={icon}/>{label}{badge(id)}</Link>)}</div>)}<div className="sidefoot"><div className="row"><b style={{color:'var(--ink)'}}>AI today</b><span className="num">{money(used(state))} / ${state.spend.cap}</span></div><Meter/><div className="row"><span><i className="dot"/>Running</span><span>Next run 06:00</span></div></div></aside><div className="main"><header className="top"><h1>{title}</h1><div className="hr">{review > 0 && <Link className="pill need" href="/review"><Icon name="eye"/>{review}<span className="lbl">&nbsp;to approve</span></Link>}{errors > 0 && <Link className="pill err" href="/logs"><Icon name="alert"/>{errors}<span className="lbl">&nbsp;error</span></Link>}<Link className="pill ai" href="/spend"><Icon name="spark"/><span className="num">{money(used(state))}</span><span className="lbl">&nbsp;of ${state.spend.cap}</span></Link><Link className="btn ghost sm" href="/profile">Profile</Link><button className="btn ghost sm" onClick={()=>void signOut()}>Sign out</button><button className="iconbtn" onClick={switchTheme} aria-label="Switch light or dark"><Icon name="moon"/></button></div></header><main className="page">{children}</main></div></div>
    <nav className="tabbar" aria-label="Main">{tabs.map(([id,icon,label,href])=><Link key={id} className={pathname===href?'on':''} href={href} onClick={()=>setMore(false)}><Icon name={icon}/>{label}{badge(id)}</Link>)}<button className={!tabs.some(item=>item[3]===pathname)?'on':''} onClick={()=>setMore(true)}><Icon name="menu"/>More{badge('logs')}</button></nav>
    {more && <><div className="scrim" onClick={()=>setMore(false)}/><div className="sheet" role="dialog" aria-label="More"><span className="grab"/>{groups.flatMap(group=>group.links).filter(item=>!tabs.some(tab=>tab[0]===item[0])).map(([id,icon,label,href])=><Link key={id} href={href} onClick={()=>setMore(false)}><Icon name={icon}/>{label}{badge(id)}</Link>)}</div></>}
    {drawerId != null && state.posts.find(post=>post.id===drawerId) && <PostDrawer post={state.posts.find(post=>post.id===drawerId)!}/>}
  </div>;
}
export function Shell({ children }: { children: React.ReactNode }) { return <StudioProvider><ShellContent>{children}</ShellContent></StudioProvider>; }
