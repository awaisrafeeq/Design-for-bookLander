'use client';
import { useState } from 'react';
import { useStudio } from '../components/StudioProvider';
import { Cover, Header, Icon } from '../components/Design';
import { getBook } from '../domain';

const patterns=[/approv|live|without|publish/,/limit|spend|cost|bill|money|budget/,/fail|error|reconnect|broke|login/,/idea|topic|add|own/,/revis|version|redo|again|cost of a post|price/,/book|catalogue|catalog|stock|cover|isbn/];
export default function HelpPage() {
  const {state,notify}=useStudio();const [question,setQuestion]=useState('');const [answer,setAnswer]=useState<{q:string;a:string}|null>(null);
  const ask=()=>{const q=question.trim();if(!q)return;const index=patterns.findIndex(pattern=>pattern.test(q.toLowerCase()));setAnswer({q,a:index>=0?state.faq[index].a:'I can help with approvals, errors, AI spend, ideas and revisions. You can also watch a training video below.'});setQuestion('')};
  return <><section className="card pad sec"><Header title="Ask a question"/><form className="ask" onSubmit={event=>{event.preventDefault();ask()}}><input placeholder="e.g. Why did my post fail?" aria-label="Your question" value={question} onChange={event=>setQuestion(event.target.value)}/><button className="btn"><Icon name="send"/>Ask</button></form>{answer&&<div className="answer"><Icon name="spark"/><span><b style={{display:'block'}}>{answer.q}</b>{answer.a}</span></div>}</section><div className="two"><section className="card pad"><div className="sechead" style={{marginBottom:6}}><h2>Common questions</h2></div>{state.faq.map(item=><details className="faq" key={item.q}><summary>{item.q}<Icon name="chevD"/></summary><p>{item.a}</p></details>)}</section><section className="sec"><Header title="Training videos"/><div className="vids" style={{gridTemplateColumns:'repeat(2,minmax(0,1fr))'}}>{state.videos.map(video=><button className="vid" key={video.title} onClick={()=>notify(`Playing: ${video.title}`)}><span className="th" style={{background:getBook(state,video.bookId).colors[0]}}><Cover bookId={video.bookId}/><span className="pl"><Icon name="play"/></span><span className="d">{video.duration}</span></span><b>{video.title}</b></button>)}</div></section></div></>;
}
