'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useStudio } from '../components/StudioProvider';
import { Chip, Header, Icon, Who } from '../components/Design';
import { sources } from '../domain';
import type { Source } from '../types';

export default function SourcesPage() {
  const { state, command, pending } = useStudio();
  const [topic, setTopic] = useState('');
  const descriptions = {
    calendar: 'Relevant holidays and reading events',
    news: 'Book and culture stories (feed not connected yet)',
    team: 'Topics your team adds by hand',
  };

  return <>
    <section className="sec">
      <Header title="What starts ideas"><Who kind="auto"/></Header>
      <div className="grid3">
        {(Object.keys(sources) as Source[]).map(key => <button className="srcc" key={key} disabled={pending} onClick={() => void command('sources', { action: 'toggle', key, value: !state.sources[key] })}>
          <span className="ti"><Icon name={sources[key].icon}/></span>
          <span className="t"><b>{sources[key].label}</b><small>{descriptions[key]}</small></span>
          <span className={`sw ${state.sources[key] ? 'on' : ''}`} role="switch" aria-checked={state.sources[key]}/>
        </button>)}
      </div>
    </section>
    <section className="sec">
      <Header title="Background for the AI"><span className="small muted">Gives context. Does not start ideas.</span></Header>
      <div className="grid2">
        <div className="srcc ctx"><span className="ti"><Icon name="book"/></span><span className="t"><b>Catalogue</b><small>Inventory and availability checks are unavailable until the catalogue is connected.</small></span><Chip tone="amber">Not connected</Chip></div>
        <Link className="srcc ctx" href="/brand"><span className="ti"><Icon name="brush"/></span><span className="t"><b>Brand rules</b><small>Voice, never-say list, styles</small></span><Icon name="chevR"/></Link>
      </div>
    </section>
    <section className="card pad sec">
      <Header title="Coming up"/>
      <div className="tblwrap"><table className="tbl"><thead><tr><th>Event</th><th>From</th><th>When</th><th>Starts in</th></tr></thead>
        <tbody>{state.events.length ? state.events.map(event => <tr key={event.id}>
          <td style={{ fontWeight: 700 }}>{event.name}</td><td><Chip><Icon name={sources[event.source].icon}/>{sources[event.source].label}</Chip></td><td>{event.date}</td><td><Chip tone={event.days <= 3 ? 'red' : event.days <= 7 ? 'amber' : ''}>{event.days} days</Chip></td>
        </tr>) : <tr><td colSpan={4} className="muted">No verified events are connected yet.</td></tr>}</tbody>
      </table></div>
      <form className="addtopic" style={{ maxWidth: 'none' }} onSubmit={async event => { event.preventDefault(); if (await command('posts', { action: 'create', title: topic })) setTopic(''); }}>
        <input placeholder="Add a team topic, e.g. Weekend reading" aria-label="Add a team topic" value={topic} onChange={event => setTopic(event.target.value)}/>
        <button className="btn" disabled={pending} type="submit"><Icon name="plus"/>Add topic</button>
      </form>
    </section>
  </>;
}
