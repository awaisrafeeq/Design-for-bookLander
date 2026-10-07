'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useStudio } from '../components/StudioProvider';
import { Cover, FormatChip, Icon, Media, Who } from '../components/Design';
import { usePostVersion, VersionPicker } from '../components/PostVersions';
import { ScheduleComposer } from '../components/Scheduling';
import type { Post } from '../types';

function ReviewWorkspace({ post, queue, select }: { post: Post; queue: Post[]; select: (id:number) => void }) {
  const {state,command,pending,openPost} = useStudio();
  const {shown,historical,selected,setSelected} = usePostVersion(post);
  const approved = post.approvedVersion === post.version;
  const processing = ['generating','revision'].includes(post.stage);
  return <div className="rv"><div className="rq">{queue.map(item => <button key={item.id} className={`q ${item.id===post.id?'on':''}`} onClick={() => select(item.id)}><Cover bookId={item.bookId}/><span className="t"><b>{item.title}</b><small>{item.format} · {item.platform} · v{item.version}</small></span></button>)}</div><div className="stage"><div className="post"><div className="ph"><span className="av">BL</span>booklender<span className="muted">· {shown.platform}</span><Who kind={shown.human?'team':'ai'}/></div><div className={`media ${shown.format==='video'?'video':'sq'}`}><Media post={shown}/></div><div className="cp"><span>{shown.caption}</span><em>{shown.tags}</em></div></div></div><div className="decide"><h2>{shown.title}</h2><div className="tools"><FormatChip post={shown}/><span className={`chip ${approved?'green':''}`}>{approved?'Approved':'Awaiting approval'}</span></div><VersionPicker post={post} selected={selected} onChange={setSelected}/>
    {!historical && <>{processing ? <p className="small muted" role="status">Generating a new version…</p> : <div className="review-actions">{!approved && <button className="btn ok lg" disabled={pending || !state.permissions?.['review.approve'] || post.brandChecks?.passed === false} onClick={() => void command('posts',{action:'approve',id:post.id,version:post.version})}><Icon name="check"/>Approve</button>}<button className="btn ghost" disabled={pending || !state.permissions?.['content.edit']} onClick={() => approved ? void command('posts',{action:'reopen',id:post.id,version:post.version}).then(ok => {if(ok)openPost(post.id);}) : openPost(post.id)}><Icon name="edit"/>Edit draft</button>{!approved && <button className="btn danger" disabled={pending || !state.permissions?.['review.approve']} onClick={() => void command('posts',{action:'reject',id:post.id,version:post.version})}><Icon name="x"/>Reject</button>}</div>}{post.error && <p className="small form-error" role="alert">{post.error}</p>}{!processing && state.modules?.includes('Schedule') && <ScheduleComposer key={post.id} post={post}/>}<div className="lockline"><Icon name="lock"/>Only an approved version can be published</div></>}
  </div></div>;
}

export default function ReviewPage() {
  const search = useSearchParams(); const {state} = useStudio();
  const [selectedId,setSelectedId] = useState<number|null>(null);
  useEffect(() => {const id=Number(search.get('post')); if(id)setSelectedId(id);},[search]);
  const queue = state.posts.filter(post => post.stage==='review' && post.media?.length);
  const focused = state.posts.find(post => post.id===selectedId && ['scheduled','generating','revision'].includes(post.stage) && post.media?.length);
  const post = queue.find(item => item.id===selectedId) || focused || queue[0];
  // Keep the newly approved post open so its slot can be set immediately.
  useEffect(() => {if(post && selectedId===null)setSelectedId(post.id);},[post?.id,selectedId]);
  if(!post) return <div className="card empty"><span className="ring"><Icon name="check"/></span><h2>All caught up</h2><span>Posts appear here once media is ready.</span><Link className="btn" href="/ideas">Pick ideas</Link></div>;
  return <ReviewWorkspace key={post.id} post={post} queue={queue} select={setSelectedId}/>;
}
