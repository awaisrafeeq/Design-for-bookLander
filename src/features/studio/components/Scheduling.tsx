'use client';
import { useEffect, useState } from 'react';
import { useStudio } from './StudioProvider';
import { Icon } from './Icon';
import { Media } from './Design';
import { BUSINESS_TIME_ZONE } from '../domain';
import type { Platform, Post } from '../types';

export function easternInput(value: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (key: string) => parts.find(item => item.type === key)?.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}
const displayDate = (date: string) => date ? `${date.slice(5,7)}/${date.slice(8,10)}/${date.slice(0,4)}` : 'Choose a date';
const displayTime = (time: string) => { const [hour, minute] = time.split(':'); return `${Number(hour) % 12 || 12}:${minute} ${Number(hour) >= 12 ? 'PM' : 'AM'}`; };

function DatePicker({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const today = easternInput(new Date().toISOString()).date;
  const [month, setMonth] = useState((value || today).slice(0,7));
  useEffect(() => { if (value) setMonth(value.slice(0,7)); }, [value]);
  const [year, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const start = new Date(Date.UTC(year, m - 1, 1 - first.getUTCDay()));
  const move = (offset: number) => setMonth(new Date(Date.UTC(year, m - 1 + offset, 1)).toISOString().slice(0,7));
  return <details className="field-picker"><summary><Icon name="cal"/><span>{displayDate(value)}</span></summary><div className="picker-popover"><div className="picker-header"><button type="button" aria-label="Previous month" onClick={() => move(-1)}><Icon name="chevL"/></button><b>{first.toLocaleDateString('en-US', {month:'long',year:'numeric',timeZone:'UTC'})}</b><button type="button" aria-label="Next month" onClick={() => move(1)}><Icon name="chevR"/></button></div><div className="date-grid">{['Su','Mo','Tu','We','Th','Fr','Sa'].map(day => <span key={day}>{day}</span>)}{Array.from({length:42}, (_, index) => {
    const date = new Date(start); date.setUTCDate(date.getUTCDate()+index); const key = date.toISOString().slice(0,10);
    return <button type="button" key={key} aria-label={displayDate(key)} aria-pressed={key === value} className={`${date.getUTCMonth() !== m - 1 ? 'other-month' : ''} ${key === value ? 'selected' : ''} ${key === today ? 'today' : ''}`} onClick={event => { onChange(key); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{date.getUTCDate()}</button>;
  })}</div><button type="button" className="btn ghost sm" onClick={event => { onChange(today); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Today</button></div></details>;
}

function TimePicker({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  const [hour, minute] = value.split(':').map(Number);
  const set = (h: number, min: number, pm: boolean) => onChange(`${String(h % 12 + (pm ? 12 : 0)).padStart(2,'0')}:${String(min).padStart(2,'0')}`);
  return <details className="field-picker"><summary><Icon name="clock"/><span>{displayTime(value)}</span></summary><div className="picker-popover time-popover"><b>Choose Eastern time</b><div className="time-selects"><label>Hour<select value={hour % 12 || 12} onChange={event => set(Number(event.target.value), minute, hour >= 12)}>{Array.from({length:12},(_, i) => <option key={i+1}>{i+1}</option>)}</select></label><label>Minute<select value={minute} onChange={event => set(hour % 12 || 12, Number(event.target.value), hour >= 12)}>{Array.from({length:60},(_, i) => <option key={i} value={i}>{String(i).padStart(2,'0')}</option>)}</select></label><label>Period<select value={hour >= 12 ? 'PM' : 'AM'} onChange={event => set(hour % 12 || 12, minute, event.target.value === 'PM')}><option>AM</option><option>PM</option></select></label></div><button type="button" className="btn sm" onClick={event => event.currentTarget.closest('details')?.removeAttribute('open')}>Done</button></div></details>;
}

function ScheduleMedia({ post }: { post?: Post }) {
  return <aside className={`schedule-media-preview ${post ? `format-${post.format}` : 'no-selection'}`} aria-label="Selected post media">{post ? <Media post={post}/> : <div className="empty"><Icon name="image"/><span>Select a post to preview its media</span></div>}</aside>;
}

export function ScheduleComposer({ post, initialDate = '', onSaved, preview }: { post?: Post; initialDate?: string; onSaved?: () => void; preview?: 'top' | 'side' }) {
  const { state, command, pending } = useStudio();
  const [selectedId, setSelectedId] = useState(post ? String(post.id) : '');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState('09:00');
  const [platforms, setPlatforms] = useState<Platform[]>(['Instagram']);
  const [error, setError] = useState('');
  const chosen = post || state.posts.find(item => String(item.id) === selectedId);
  const editable = state.posts.filter(item => ['review','scheduled'].includes(item.stage) && item.media?.length && item.approvedVersion === item.version);
  useEffect(() => {
    setSelectedId(post ? String(post.id) : ''); setDate(initialDate); setTime('09:00'); setError('');
    if (post) { setPlatforms(post.platforms || [post.platform]); if (post.scheduledAt) { const local = easternInput(post.scheduledAt); setDate(local.date); setTime(local.time); } }
  }, [post?.id, post?.scheduledAt, initialDate]);
  const choose = (id: string) => { setSelectedId(id); const item = editable.find(p => String(p.id) === id); if (!item) return; setPlatforms(item.platforms || [item.platform]); if (item.scheduledAt) { const local = easternInput(item.scheduledAt); if(!initialDate)setDate(local.date); setTime(local.time); } };
  if (post?.stage === 'published') return <section className="schedule-composer">{preview && <ScheduleMedia post={post}/>}<b>Published</b><p className="small muted">{post.scheduledAt ? `${displayDate(easternInput(post.scheduledAt).date)} · ${displayTime(easternInput(post.scheduledAt).time)} ET` : 'This post has already been published.'}</p>{post.publicationTargets?.filter(target => target.postUrl).map(target => <a key={target.id} className="btn ghost sm" href={target.postUrl} target="_blank" rel="noreferrer">View {target.platform} post</a>)}</section>;
  return <section className={`schedule-composer ${preview === 'side' ? 'side-preview' : ''}`}>{preview === 'top' && chosen && <ScheduleMedia post={chosen}/>}<div className="sechead"><h2>Posting schedule</h2><span className="chip">Eastern Time</span></div><p className="small muted">{chosen?.approvedVersion === chosen?.version && chosen ? 'Approved. Choose when this post should go live.' : 'Approve this post before choosing a publishing time.'}</p>{preview === 'side' && <ScheduleMedia post={chosen}/>}<form onSubmit={async event => {
    event.preventDefault(); if (!chosen || chosen.approvedVersion !== chosen.version) { setError('Approve this post before scheduling it.'); return; } if (!date || !platforms.length) { setError('Choose a post, date, time, and at least one platform.'); return; }
    setError(''); if (await command('schedule', {action:'save',id:chosen.id,version:chosen.version,scheduledAt:`${date}T${time}`,platforms})) onSaved?.();
  }}><div className="schedule-fields">{!post && <label className="schedule-post">Post<select value={selectedId} onChange={event => choose(event.target.value)} required><option value="">Choose a post</option>{editable.map(item => <option key={item.id} value={item.id}>{item.title} · {item.stage === 'scheduled' && item.scheduledAt ? 'Update saved schedule' : 'Approved · ready to schedule'}</option>)}</select></label>}<div className="schedule-field"><span>Date · MM/DD/YYYY</span><DatePicker value={date} onChange={setDate}/></div><div className="schedule-field"><span>Time · ET</span><TimePicker value={time} onChange={setTime}/></div></div><fieldset className="schedule-platforms"><legend>Publish to</legend>{(['Instagram','Facebook'] as Platform[]).map(platform => <label key={platform} className={platforms.includes(platform) ? 'chosen' : ''}><input type="checkbox" checked={platforms.includes(platform)} onChange={event => setPlatforms(current => event.target.checked ? [...current,platform] : current.filter(p => p !== platform))}/>{platform}</label>)}</fieldset>{error && <p className="small form-error" role="alert">{error}</p>}<div className="tools"><button className="btn" disabled={pending || !state.permissions?.['schedule.manage'] || chosen?.approvedVersion !== chosen?.version || !editable.length && !post}>Save schedule</button>{chosen?.scheduledAt && state.permissions?.['publish.send'] && <button type="button" className="btn ghost" disabled={pending} onClick={() => void command('schedule',{action:'cancel',id:chosen.id,version:chosen.version})}>Cancel schedule</button>}{chosen?.publicationStatus === 'failed' && state.permissions?.['publish.send'] && <button type="button" className="btn ghost" disabled={pending} onClick={() => void command('schedule',{action:'retry',id:chosen.id,version:chosen.version})}>Retry schedule</button>}</div>{chosen?.publicationTargets?.map(target => <p className="small muted" key={target.id}>{target.platform} · {target.status}{target.postUrl && <> · <a href={target.postUrl} target="_blank" rel="noreferrer">View post</a></>}{target.error && <> · {target.error}</>}</p>)}</form></section>;
}
