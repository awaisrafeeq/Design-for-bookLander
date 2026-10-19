'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { studioApi, type Sources } from '../api';
import { useStudio } from '../components/StudioProvider';
import { Chip, Header, Icon, Who } from '../components/Design';
import { sources } from '../domain';
import type { Source } from '../types';

const descriptions: Record<Source, string> = {
  calendar: 'US holidays and observances from Calendarific',
  news: 'Recent book and reading stories from one selected news provider',
  books: 'Current US bestseller lists from The New York Times Books API',
  team: 'Topics your team adds by hand',
};
const providerFor: Partial<Record<Source, string>> = { calendar: 'calendarific', books: 'nyt_books' };

export default function SourcesPage() {
  const { state, command, pending } = useStudio();
  const [topic, setTopic] = useState('');
  const [feeds, setFeeds] = useState<Sources | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = async () => { try { const result = await studioApi.get('sources'); if (alive) setFeeds(result); } catch { /* keep the last successful feed status */ } };
    void refresh();
    const timer = setInterval(() => void refresh(), 7000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const feedState = feeds || { sources: state.sources, connections: state.connections, events: state.events, providers: state.sourceFeeds, newsProvider: state.newsProvider };
  const providers = feedState.providers || {};
  const newsProviderKey = feedState.newsProvider || 'currents';
  const newsProvider = providers[newsProviderKey];
  const rows: Source[] = ['calendar', 'news', 'books', 'team'];
  const feedItems = feedState.events || [];

  return <>
    <section className="sec">
      <Header title="What starts ideas"><Who kind="auto"/></Header>
      <div className="grid3">
        {rows.map(key => {
          const provider = key === 'news' ? newsProvider : providers[providerFor[key] || ''];
          const isConfigured = key === 'team' || Boolean(provider?.configured);
          return <button className="srcc" key={key} disabled={pending || (!isConfigured && !feedState.sources[key])} title={!isConfigured ? 'Add the provider API key to backend/.env and restart the API and worker.' : undefined}
            onClick={() => void command('sources', { action: 'toggle', key, value: !feedState.sources[key] })}>
            <span className="ti"><Icon name={sources[key].icon}/></span>
            <span className="t"><b>{sources[key].label}</b><small>{descriptions[key]}</small>
              {key !== 'team' && <small>{provider?.configured ? `${provider.items} saved · ${provider.lastSyncedAt ? `Synced ${new Date(provider.lastSyncedAt).toLocaleString('en-US')}` : provider.status === 'running' ? 'Syncing now' : 'Not synced yet'}` : 'API key not configured'}</small>}
            </span>
            <span className={`sw ${feedState.sources[key] ? 'on' : ''}`} role="switch" aria-checked={Boolean(feedState.sources[key])}/>
          </button>;
        })}
      </div>
      <div className="tools" style={{ marginTop: 12 }}>
        <label className="small">News provider
          <select aria-label="News provider" value={newsProviderKey} disabled={pending} onChange={event => void command('sources', { action: 'news-provider', provider: event.target.value })}>
            <option value="currents">Currents</option><option value="newsdata">NewsData.io</option>
          </select>
        </label>
        <span className="small muted">Only the selected provider is called. Add its key in the server environment.</span>
        <button className="btn" style={{ marginLeft: 'auto' }} disabled={pending || !rows.some(key => key !== 'team' && feedState.sources[key] && (key === 'news' ? newsProvider?.configured : providers[providerFor[key] || '']?.configured))}
          onClick={() => void command('sources', { action: 'sync-feeds' })}><Icon name="retry"/>Sync active feeds</button>
      </div>
      {newsProvider?.error && <p className="small" role="status">News feed sync failed: {newsProvider.error}</p>}
      {Object.entries(providers).some(([, provider]) => provider.status === 'failed' && provider.enabled) && <p className="small" role="status">A feed sync failed. Check its API key, provider quota, or provider status, then retry.</p>}
    </section>
    <section className="sec">
      <Header title="Background for the AI"><span className="small muted">Feed records become ideas only after you ask the AI to suggest them. Team members still pick each idea.</span></Header>
      <div className="grid2">
        {state.modules?.includes('Catalogue') ? <Link className="srcc ctx" href="/catalogue"><span className="ti"><Icon name="book"/></span><span className="t"><b>Catalogue</b><small>Imported titles and manually added books can enrich matching drafts. Inventory and rental availability are not verified.</small></span><Icon name="chevR"/></Link> : <div className="srcc ctx"><span className="ti"><Icon name="book"/></span><span className="t"><b>Catalogue</b><small>Book title details can enrich matching drafts. Inventory and rental availability are not verified.</small></span></div>}
        <Link className="srcc ctx" href="/brand"><span className="ti"><Icon name="brush"/></span><span className="t"><b>Brand rules</b><small>Voice, never-say list, styles</small></span><Icon name="chevR"/></Link>
      </div>
    </section>
    <section className="card pad sec">
      <Header title="Saved source material"/>
      <div className="tblwrap"><table className="tbl"><thead><tr><th>Story or event</th><th>Source</th><th>Provider</th><th>Date</th></tr></thead>
        <tbody>{feedItems.length ? feedItems.slice(0, 50).map(event => <tr key={event.id}>
          <td style={{ fontWeight: 700 }}>{event.url ? <a href={event.url} target="_blank" rel="noreferrer">{event.name}</a> : event.name}{event.summary && <small className="muted" style={{ display: 'block', fontWeight: 400 }}>{event.summary}</small>}</td>
          <td><Chip><Icon name={sources[event.source].icon}/>{sources[event.source].label}</Chip></td><td>{event.provider || '—'}</td><td>{new Date(`${event.date}T12:00:00`).toLocaleDateString('en-US')}</td>
        </tr>) : <tr><td colSpan={4} className="muted">No feed material saved. Configure and enable a source, then sync it.</td></tr>}</tbody>
      </table></div>
      <form className="addtopic" style={{ maxWidth: 'none' }} onSubmit={async event => { event.preventDefault(); if (await command('posts', { action: 'create', title: topic })) setTopic(''); }}>
        <input placeholder="Add a team topic, e.g. Weekend reading" aria-label="Add a team topic" value={topic} onChange={event => setTopic(event.target.value)}/>
        <button className="btn" disabled={pending} type="submit"><Icon name="plus"/>Add topic</button>
      </form>
    </section>
  </>;
}
