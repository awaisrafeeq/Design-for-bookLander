'use client';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Media } from './Design';
import { BUSINESS_TIME_ZONE } from '../domain';
import type { Post } from '../types';

export function easternInput(value: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (key: string) => parts.find(item => item.type === key)?.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}
export const displayDate = (date: string) => date ? `${date.slice(5,7)}/${date.slice(8,10)}/${date.slice(0,4)}` : 'Choose a date';
export const displayTime = (time: string) => { const [hour, minute] = time.split(':'); return `${Number(hour) % 12 || 12}:${minute} ${Number(hour) >= 12 ? 'PM' : 'AM'}`; };

export function DatePicker({ value, onChange }: { value: string; onChange: (date: string) => void }) {
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

export function TimePicker({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  const [hour, minute] = value.split(':').map(Number);
  const set = (h: number, min: number, pm: boolean) => onChange(`${String(h % 12 + (pm ? 12 : 0)).padStart(2,'0')}:${String(min).padStart(2,'0')}`);
  return <details className="field-picker"><summary><Icon name="clock"/><span>{displayTime(value)}</span></summary><div className="picker-popover time-popover"><b>Choose Eastern time</b><div className="time-selects"><label>Hour<select value={hour % 12 || 12} onChange={event => set(Number(event.target.value), minute, hour >= 12)}>{Array.from({length:12},(_, i) => <option key={i+1}>{i+1}</option>)}</select></label><label>Minute<select value={minute} onChange={event => set(hour % 12 || 12, Number(event.target.value), hour >= 12)}>{Array.from({length:60},(_, i) => <option key={i} value={i}>{String(i).padStart(2,'0')}</option>)}</select></label><label>Period<select value={hour >= 12 ? 'PM' : 'AM'} onChange={event => set(hour % 12 || 12, minute, event.target.value === 'PM')}><option>AM</option><option>PM</option></select></label></div><button type="button" className="btn sm" onClick={event => event.currentTarget.closest('details')?.removeAttribute('open')}>Done</button></div></details>;
}

export function ScheduleMedia({ post }: { post?: Post }) {
  return <aside className={`schedule-media-preview ${post ? `format-${post.format}` : 'no-selection'}`} aria-label="Selected post media">{post ? <Media post={post}/> : <div className="empty"><Icon name="image"/><span>Select a post to preview its media</span></div>}</aside>;
}
