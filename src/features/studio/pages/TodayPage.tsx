'use client';
import Link from 'next/link';
import { useStudio } from '../components/StudioProvider';
import { Cover, DueChip, Header, Icon, Meta, SourceChip, VersionChip, money } from '../components/Design';
import { byTime, dayParts, formatEasternDate, used } from '../domain';

const words = ['No','One','Two','Three','Four','Five','Six','Seven','Eight','Nine'];
const countWord = (count: number) => words[count] || String(count);

export default function TodayPage() {
  const { state, openPost } = useStudio();
  const modules = new Set(state.modules || []);
  const canReview = modules.has('Review');
  const canLogs = modules.has('Logs');
  const canSchedule = modules.has('Schedule');
  const canIdeas = modules.has('Ideas');
  const canSpend = modules.has('AI spend');
  const review = canReview ? state.posts.filter(post=>post.stage==='review' && post.approvedVersion !== post.version) : [];
  const errors = canLogs ? state.posts.filter(post=>post.error) : [];
  const today = canSchedule ? state.posts.filter(post=>['scheduled','published'].includes(post.stage)&&post.day===0).sort(byTime) : [];
  const ideas = canIdeas ? state.posts.filter(post=>post.stage==='idea') : [];
  const scheduledToday = today.filter(post=>post.stage==='scheduled'&&!post.error&&['queued','scheduled','publishing'].includes(post.publicationStatus||''));
  const date = dayParts(0);
  const longDate = formatEasternDate(new Date());
  const hasAttention = canReview || canLogs;
  const hasUpcoming = canSchedule || canIdeas;

  return <>
    <section className="lede" aria-label="Summary for today"><span className="date">{longDate || `${date.wd} ${date.d} ${date.m}`}</span><p>
      {canReview && (review.length ? <><Link href="/review" className="n-need">{countWord(review.length)} {review.length===1?'post':'posts'}</Link> {review.length===1?'waits':'wait'} for your approval. </> : <>Nothing is waiting for your approval. </>)}
      {canLogs && errors.length > 0 && <><Link href="/logs" className="n-err">{countWord(errors.length)} {errors.length===1?'post':'posts'}</Link> need attention. {errors[0].error} </>}
      {canSchedule && (scheduledToday.length ? `${countWord(scheduledToday.length)} scheduled today; next at ${scheduledToday[0].time}.` : 'No confirmed publication is scheduled for today.')}
      {!canReview && !canLogs && !canSchedule && (canIdeas ? 'Your ideas are ready to explore.' : canSpend ? 'Your AI usage is ready to view.' : 'Welcome to your workspace.')}
    </p></section>
    {(canReview||canLogs||canSchedule||canSpend) && <div className="tiles">
      {canReview && <Link className={`tile ${review.length?'need':'calm'}`} href="/review"><span className="ti"><Icon name="eye"/></span><b>{review.length}</b><span>To approve</span></Link>}
      {canLogs && <Link className={`tile ${errors.length?'err':'calm'}`} href="/logs"><span className="ti"><Icon name="alert"/></span><b>{errors.length}</b><span>{errors.length===1?'Error':'Errors'}</span></Link>}
      {canSchedule && <Link className="tile calm" href="/schedule"><span className="ti"><Icon name="cal"/></span><b>{today.length}</b><span>Calendar today</span></Link>}
      {canSpend && <Link className="tile" href="/spend"><span className="ti" style={{background:'var(--aibg)',color:'var(--ai)'}}><Icon name="spark"/></span><b className="num">{money(used(state))}</b><span>OpenRouter recorded today</span><span className="sub num">View provider usage</span></Link>}
    </div>}
    {(hasAttention||hasUpcoming) && <div className="two" style={hasAttention&&hasUpcoming?undefined:{gridTemplateColumns:'minmax(0,1fr)'}}>
      {hasAttention && <section className="sec"><Header title="Needs you"/><div className="rows">
        {review.map(post=><Link key={post.id} className="rowi" href={`/review?post=${post.id}`}><Cover bookId={post.bookId}/><span className="t"><b>{post.title}</b><small><Meta post={post}/><DueChip post={post}/><VersionChip post={post}/></small></span><span className="btn sm">Review</span></Link>)}
        {errors.map(post=><div key={post.id} className="rowi err"><span className="ico" style={{background:'var(--surf)',color:'var(--err)'}}><Icon name="alert"/></span><span className="t"><b>{post.title}</b><small>{post.error}</small></span><Link className="btn sm" href="/logs">View fix</Link></div>)}
        {!review.length&&!errors.length&&<div className="card pad muted">Nothing needs your attention right now.</div>}
      </div></section>}
      {hasUpcoming && <section className="sec">
        {canSchedule && <><Header title="Posting today"><Link className="btn sm ghost r" href="/schedule">Schedule</Link></Header><div className="card pad tl">{today.length ? today.map(post=><div className="it" key={post.id}><span className="tm">{post.time}</span><span className="ln"><i className={post.error?'fail':post.stage==='published'?'':'sched'}/></span><span><b style={{display:'block'}}>{post.title}</b><span className="small muted">{post.platform} · {post.error ? <span style={{color:'var(--err)',fontWeight:700}}>Failed</span> : post.stage==='published'?'Posted':post.publicationStatus === 'held' ? 'Held - awaiting approval or publisher' : post.publicationStatus || 'Approved - awaiting schedule'}</span></span></div>) : <span className="muted">No posts scheduled today.</span>}</div></>}
        {canIdeas && <><div className="sechead" style={canSchedule?{marginTop:6}:undefined}><h2>New ideas</h2><Link className="btn sm ghost r" href="/ideas">See {ideas.length}</Link></div><div className="rows">{ideas.slice(0,3).map(post=><button className="rowi" key={post.id} onClick={()=>openPost(post.id)} style={!post.human?{borderStyle:'dashed',borderColor:'var(--ailine)'}:undefined}><Cover bookId={post.bookId}/><span className="t"><b>{post.title}</b><small><SourceChip post={post}/><DueChip post={post}/></small></span><Icon name="chevR"/></button>)}{!ideas.length&&<div className="card pad muted">No new ideas yet.</div>}</div></>}
      </section>}
    </div>}
  </>;
}
