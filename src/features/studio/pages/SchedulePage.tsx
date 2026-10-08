'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import type { DatesSetArg } from '@fullcalendar/core';
import { useStudio } from '../components/StudioProvider';
import { Icon } from '../components/Design';
import { ScheduleComposer } from '../components/PublishingComposer';
import { studioApi } from '../api';
import type { PublishingPlatform, Post } from '../types';
import { BUSINESS_TIME_ZONE } from '../domain';
import { PUBLISHING_TARGETS, publishingName } from '../publishing';

export { easternInput } from '../components/Scheduling';

export default function SchedulePage() {
  const {state,command,pending} = useStudio();
  const [range,setRange] = useState<{start:string;end:string}|null>(null);
  const [events,setEvents] = useState<Post[]>([]);
  const [loading,setLoading] = useState(false); const [error,setError] = useState(''); const [filter,setFilter] = useState('');
  const [slot,setSlot] = useState<{date:string;postId?:number}|null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const canSchedule = state.permissions?.['schedule.manage']===true;
  const canConnect = state.permissions?.['sources.manage']===true;
  const datesSet = useCallback((value:DatesSetArg) => setRange(old => old?.start===value.startStr && old.end===value.endStr ? old : {start:value.startStr,end:value.endStr}),[]);
  useEffect(() => {if(!range)return; let active=true; setLoading(true);setError(''); void studioApi.calendar(range.start,range.end).then(posts => {if(active)setEvents(posts);}).catch((failure:Error) => {if(active)setError(failure.message);}).finally(() => {if(active)setLoading(false);});return () => {active=false;};},[range,state.posts]);
  useEffect(() => {
    if(!slot)return; const previous=document.activeElement as HTMLElement|null; dialogRef.current?.focus();
    const onKey=(event:KeyboardEvent) => {if(event.key==='Escape')setSlot(null);if(event.key==='Tab') {const nodes=dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),summary,[href]');if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}}};
    window.addEventListener('keydown',onKey);return () => {window.removeEventListener('keydown',onKey);previous?.focus();};
  },[Boolean(slot)]);
  const modalPost = slot?.postId ? state.posts.find(post => post.id===slot.postId) : undefined;
  const connectedAccounts = (state.accounts || []).filter(account => account.active);
  const platforms = [...new Set(['instagram','facebook', ...connectedAccounts.map(account => account.platform)])];
  return <><section className="card publishing-bar"><div className="publishing-bar-heading"><b>Zernio connections</b><span className="small muted">Select one account per publishing platform · Eastern Time</span></div><div className="account-fields">{platforms.map(platform => {
        const accounts = connectedAccounts.filter(account => account.platform === platform);
        const supported = PUBLISHING_TARGETS.some(item => item.api === platform);
        return supported ? <label key={platform}><span>{publishingName(platform)}</span><select aria-label={`${platform} publishing account`} disabled={pending || !canConnect} value={accounts.find(account => account.selected)?.id || ''} onChange={event => void command('sources',{action:'select-account',id:event.target.value})}><option value="">{accounts.length ? 'Choose an account' : 'No connected account'}</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          : <div className="account-discovered" key={platform}><b>{publishingName(platform)}</b>{accounts.map(account => <span key={account.id}>{account.name}</span>)}<small>Connected · posting is not configured for this platform</small></div>;
      })}</div>{canConnect && <button className="btn ghost sm" disabled={pending} onClick={() => void command('sources',{action:'sync-accounts'})}><Icon name="retry"/>Sync accounts</button>}</section>
    <div className="tools schedule-toolbar">{[['','All'],...PUBLISHING_TARGETS.map(item => [item.name,item.name])].map(([value,label]) => <button key={label} className={`fchip ${filter===value?'on':''}`} onClick={() => setFilter(value)}>{label}</button>)}{canSchedule && <button className="btn" style={{marginLeft:'auto'}} onClick={() => setSlot({date:''})}><Icon name="plus"/>New schedule</button>}</div>
    <section className="card pad sec schedule-calendar" aria-label="Publishing calendar" aria-busy={loading}>{error && <p className="small form-error" role="alert">{error}</p>}
      <FullCalendar plugins={[dayGridPlugin,interactionPlugin,luxonPlugin]} initialView="dayGridWeek" timeZone={BUSINESS_TIME_ZONE} datesSet={datesSet} height="auto" fixedWeekCount={false} headerToolbar={{left:'prev,next today',center:'title',right:'dayGridWeek,dayGridMonth'}} buttonText={{today:'Today',week:'Week',month:'Month'}} dayMaxEvents={3}
        events={events.filter(post => !filter || (post.platforms || [post.platform]).includes(filter as PublishingPlatform)).map(post => ({id:String(post.id),title:post.title,start:post.scheduledAt,classNames:[`calendar-${post.publicationStatus || 'held'}`],extendedProps:{post}}))}
        eventClick={info => setSlot({date:info.event.startStr.slice(0,10),postId:(info.event.extendedProps.post as Post).id})}
        dateClick={info => {if(canSchedule)setSlot({date:info.dateStr.slice(0,10)});}}
        eventContent={info => {const post=info.event.extendedProps.post as Post;return <div className="calendar-post"><span>{info.timeText} · {(post.platforms || [post.platform]).map(platform => platform === 'Instagram' ? 'IG' : platform === 'Facebook' ? 'FB' : platform).join(' + ')}</span><b>{post.title}</b><small>{post.publicationStatus || 'Awaiting approval'}</small></div>;}}/>
      <p className="small muted calendar-hint">Select a day to choose a post, platforms, and time. Eastern Time adjusts for daylight saving.</p>
    </section><section className="card pad sec"><ScheduleComposer preview="side"/></section>
    {slot && <><div className="scrim" onClick={() => setSlot(null)}/><div ref={dialogRef} tabIndex={-1} className="schedule-modal" role="dialog" aria-modal="true" aria-label="Schedule a post"><div className="schedule-modal-header"><b>{modalPost?.title || 'Schedule a post'}</b><button className="iconbtn" aria-label="Close scheduling" onClick={() => setSlot(null)}><Icon name="x"/></button></div><ScheduleComposer key={`${slot.postId || 'new'}-${slot.date}`} post={modalPost} initialDate={slot.date} preview="top" onSaved={() => setSlot(null)}/></div></>}
  </>;
}
