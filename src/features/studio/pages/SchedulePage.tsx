'use client';
import { useCallback, useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import type { DatesSetArg } from '@fullcalendar/core';
import { useStudio } from '../components/StudioProvider';
import { Icon } from '../components/Design';
import { studioApi } from '../api';
import type { Platform, Post } from '../types';
import { BUSINESS_TIME_ZONE } from '../domain';

export function easternInput(value: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (key: string) => parts.find(item => item.type === key)?.value;
  return { date: `${part('month')}/${part('day')}/${part('year')}`, time: `${part('hour')}:${part('minute')}` };
}

function calendarDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${month}/${day}/${year}`;
}

function localScheduleValue(date: string, time: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!match || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return '';
  const [, month, day, year] = match;
  const check = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (check.getUTCFullYear() !== Number(year) || check.getUTCMonth() + 1 !== Number(month) || check.getUTCDate() !== Number(day)) return '';
  // The API interprets offset-free date/time values as Eastern wall time.
  return `${year}-${month}-${day}T${time}`;
}

export default function SchedulePage() {
  const { state, command, pending, openPost } = useStudio();
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [events, setEvents] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [scheduleError, setScheduleError] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>(['Instagram']);
  const chosen = state.posts.find(post => String(post.id) === selectedId);
  const editable = state.posts.filter(post => ['review', 'scheduled'].includes(post.stage));
  const canSchedule = state.permissions?.['schedule.manage'] === true;
  const canConnect = state.permissions?.['sources.manage'] === true;
  const datesSet = useCallback((value: DatesSetArg) => setRange(old => old?.start === value.startStr && old.end === value.endStr ? old : { start: value.startStr, end: value.endStr }), []);
  useEffect(() => {
    if (!range) return;
    let active = true;
    setLoading(true); setError('');
    void studioApi.calendar(range.start, range.end).then(posts => { if (active) setEvents(posts); })
      .catch((failure: Error) => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range, state.posts]);
  function choose(post: Post) {
    setSelectedId(String(post.id)); setPlatforms(post.platforms || [post.platform]);
    if (post.scheduledAt) {
      const local = easternInput(post.scheduledAt);
      setDate(local.date); setTime(local.time);
    }
  }
  return <>
    <div className="conns"><span className="small muted">Posting to</span>{state.connections.filter(item => item.purpose === 'Publishing').map(item => <span className={`pill ${item.connected ? 'ok' : 'err'}`} key={item.id}><Icon name={item.connected ? 'check' : 'plug'}/>{item.name}</span>)}<span className="small muted">Eastern Time (ET) · adjusts for daylight saving</span></div>
    <div className="tools">{[['', 'All'], ['Instagram', 'Instagram'], ['Facebook', 'Facebook']].map(([value, label]) => <button key={label} className={`fchip ${filter === value ? 'on' : ''}`} onClick={() => setFilter(value)}>{label}</button>)}{canConnect && <button className="btn ghost sm" style={{ marginLeft: 'auto' }} disabled={pending} onClick={() => void command('sources', { action: 'sync-accounts' })}><Icon name="retry"/>Sync accounts</button>}</div>
    {canConnect && <section className="card pad sec publishing-accounts">{['instagram', 'facebook'].map(platform => <label key={platform}>{platform === 'instagram' ? 'Instagram' : 'Facebook'} account<select aria-label={`${platform} publishing account`} disabled={pending} value={state.accounts?.find(account => account.platform === platform && account.selected)?.id || ''} onChange={event => void command('sources', { action: 'select-account', id: event.target.value })}><option value="">Choose after syncing</option>{state.accounts?.filter(account => account.platform === platform && account.active).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>)}</section>}
    <section className="card pad sec schedule-calendar" aria-label="Publishing calendar">
      {loading && <p className="small muted" role="status">Refreshing calendar…</p>}{error && <p className="small" role="alert">{error}</p>}
      <FullCalendar plugins={[dayGridPlugin, interactionPlugin, luxonPlugin]} initialView="dayGridWeek" timeZone={BUSINESS_TIME_ZONE} datesSet={datesSet} height="auto" fixedWeekCount={false} headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridWeek,dayGridMonth' }} buttonText={{ today: 'Today', week: 'Week', month: 'Month' }} dayMaxEvents={3}
        events={events.filter(post => !filter || (post.platforms || [post.platform]).includes(filter as Platform)).map(post => ({ id: String(post.id), title: post.title, start: post.scheduledAt, classNames: [`calendar-${post.publicationStatus || (post.approvedVersion === post.version ? 'scheduled' : 'held')}`], extendedProps: { post } }))}
        eventClick={info => choose(info.event.extendedProps.post as Post)} dateClick={info => { if (canSchedule) { setDate(calendarDate(info.dateStr)); setTime('09:00'); } }}
        eventContent={info => { const post = info.event.extendedProps.post as Post; return <div className="calendar-post"><span>{info.timeText} · {(post.platforms || [post.platform]).map(platform => platform === 'Instagram' ? 'IG' : 'FB').join(' + ')}</span><b>{post.title}</b><small>{post.publicationStatus || 'Waiting for approval'}</small></div>; }} />
    </section>
    <section className="card pad sec"><div className="sechead"><h2>Choose a time</h2><span className="small muted">Only approved posts are sent to Zernio.</span></div>
      {!editable.length ? <p className="muted">Send a draft to Review to reserve its calendar slot.</p> : <form className="schedule-form" onSubmit={async event => { event.preventDefault(); const scheduledAt = localScheduleValue(date, time); if (!scheduledAt) { setScheduleError('Enter a real date as MM/DD/YYYY and a valid Eastern time.'); return; } setScheduleError(''); if (chosen) await command('schedule', { action: 'save', id: chosen.id, version: chosen.version, scheduledAt, platforms }); }}>
        <label>Post<select value={selectedId} required onChange={event => { const post = editable.find(item => String(item.id) === event.target.value); if (post) choose(post); else setSelectedId(''); }}><option value="">Choose a post</option>{editable.map(post => <option key={post.id} value={post.id}>{post.title}{post.approvedVersion === post.version ? ' · approved' : ' · awaiting approval'}</option>)}</select></label>
        <label>Eastern date (MM/DD/YYYY)<input type="text" inputMode="numeric" placeholder="MM/DD/YYYY" pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}" maxLength={10} value={date} required onChange={event => setDate(event.target.value)}/></label>
        <label>Eastern time<input type="time" value={time} required onChange={event => setTime(event.target.value)}/></label>
        {scheduleError && <p className="small" role="alert">{scheduleError}</p>}
        <div className="platform-options">{(['Instagram', 'Facebook'] as Platform[]).map(platform => <label key={platform}><input type="checkbox" checked={platforms.includes(platform)} onChange={event => setPlatforms(current => event.target.checked ? [...current, platform] : current.filter(value => value !== platform))}/>{platform}</label>)}</div>
        <div className="tools"><button className="btn" disabled={pending || !canSchedule || !platforms.length}>Save schedule</button>{chosen && <button type="button" className="btn ghost" onClick={() => openPost(chosen.id)}>Open post</button>}{chosen?.scheduledAt && state.permissions?.['publish.send'] && <button type="button" className="btn danger" disabled={pending} onClick={() => void command('schedule', { action: 'cancel', id: chosen.id, version: chosen.version })}>Cancel schedule</button>}{chosen?.publicationStatus === 'failed' && state.permissions?.['publish.send'] && <button type="button" className="btn ghost" disabled={pending} onClick={() => void command('schedule', { action: 'retry', id: chosen.id, version: chosen.version })}>Retry status / schedule</button>}</div>
        {chosen?.publicationTargets?.map(target => <p className="small" key={target.id}>{target.platform} · {target.status}{target.postUrl && <> · <a href={target.postUrl} target="_blank" rel="noreferrer">View published post</a></>}{target.error && <> · {target.error}</>}</p>)}
      </form>}
    </section>
  </>;
}
