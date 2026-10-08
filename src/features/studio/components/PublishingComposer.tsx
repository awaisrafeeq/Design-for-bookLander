'use client';

import { useEffect, useState } from 'react';
import { studioApi } from '../api';
import { PUBLISHING_TARGETS } from '../publishing';
import type { Post, PublishingPlatform } from '../types';
import { useStudio } from './StudioProvider';
import { DatePicker, displayDate, displayTime, easternInput, ScheduleMedia, TimePicker } from './Scheduling';

type Options = Record<string, Record<string, string | boolean>>;
type Board = { id: string; name: string };
type CreatorInfo = {
  privacyLevels?: { value: string; label: string }[];
  postingLimits?: { interactionSettings?: Record<string, { enabled?: boolean; default?: boolean }> };
  commercialContentTypes?: { value: string; label: string }[];
};

export function ScheduleComposer({ post, initialDate = '', onSaved, preview }: {
  post?: Post; initialDate?: string; onSaved?: () => void; preview?: 'top' | 'side';
}) {
  const { state, command, pending } = useStudio();
  const [selectedId, setSelectedId] = useState(post ? String(post.id) : '');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState('09:00');
  const [platforms, setPlatforms] = useState<PublishingPlatform[]>(['Instagram']);
  const [options, setOptions] = useState<Options>({});
  const [boards, setBoards] = useState<Board[]>([]);
  const [creator, setCreator] = useState<CreatorInfo | null>(null);
  const [optionError, setOptionError] = useState('');
  const [error, setError] = useState('');
  const chosen = post || state.posts.find(item => String(item.id) === selectedId);
  const editable = state.posts.filter(item => ['review', 'scheduled'].includes(item.stage) && item.media?.length && item.approvedVersion === item.version);
  const fixedTargets = chosen?.stage === 'scheduled' && Boolean(chosen.scheduledAt);
  const accountFor = (api: string) => state.accounts?.find(account => account.platform === api && account.active && account.selected);
  const pinAccountId = accountFor('pinterest')?.id;
  const tikAccountId = accountFor('tiktok')?.id;
  const tikMediaType = chosen?.media?.[0]?.type === 'video' ? 'video' : 'photo';
  const contentLength = `${chosen?.caption || ''}\n\n${chosen?.tags || ''}`.trim().length;

  useEffect(() => {
    setSelectedId(post ? String(post.id) : ''); setDate(initialDate); setTime('09:00'); setError('');
    setPlatforms(post?.platforms || [post?.platform || 'Instagram']);
    setOptions(post?.platformSettings || {});
    if (post?.scheduledAt) {
      const local = easternInput(post.scheduledAt);
      setDate(local.date); setTime(local.time);
    }
  }, [post?.id, post?.scheduledAt, initialDate]);

  useEffect(() => {
    if (!platforms.includes('Pinterest') || !pinAccountId) { setBoards([]); return; }
    let active = true;
    void studioApi.accountOptions<{ boards: Board[] }>(pinAccountId, 'pinterest-boards')
      .then(result => { if (active) { setBoards(result.boards || []); setOptionError(''); } })
      .catch((failure: Error) => { if (active) { setBoards([]); setOptionError(failure.message); } });
    return () => { active = false; };
  }, [pinAccountId, platforms.includes('Pinterest')]);

  useEffect(() => {
    if (!platforms.includes('TikTok') || !tikAccountId || !chosen?.media?.length) { setCreator(null); return; }
    let active = true;
    void studioApi.accountOptions<CreatorInfo>(tikAccountId, 'tiktok-creator-info', tikMediaType)
      .then(result => { if (active) { setCreator(result); setOptionError(''); } })
      .catch((failure: Error) => { if (active) { setCreator(null); setOptionError(failure.message); } });
    return () => { active = false; };
  }, [tikAccountId, tikMediaType, chosen?.id, platforms.includes('TikTok')]);

  const setOption = (platform: PublishingPlatform, key: string, value: string | boolean) =>
    setOptions(current => ({ ...current, [platform]: { ...(current[platform] || {}), [key]: value } }));
  const choose = (id: string) => {
    setSelectedId(id); setError('');
    const item = editable.find(candidate => String(candidate.id) === id);
    if (!item) return;
    setPlatforms(item.platforms || [item.platform]);
    setOptions(item.platformSettings || {});
    if (item.scheduledAt) {
      const local = easternInput(item.scheduledAt);
      if (!initialDate) setDate(local.date);
      setTime(local.time);
    }
  };

  if (post?.stage === 'published') return <section className="schedule-composer">
    {preview && <ScheduleMedia post={post}/>}
    <b>Published</b>
    <p className="small muted">{post.scheduledAt ? `${displayDate(easternInput(post.scheduledAt).date)} · ${displayTime(easternInput(post.scheduledAt).time)} ET` : 'This post has already been published.'}</p>
    {post.publicationTargets?.filter(target => target.postUrl).map(target => <a key={target.id} className="btn ghost sm" href={target.postUrl} target="_blank" rel="noreferrer">View {target.platform} post</a>)}
  </section>;

  return <section className={`schedule-composer ${preview === 'side' ? 'side-preview' : ''}`}>
    {preview === 'top' && chosen && <ScheduleMedia post={chosen}/>}
    <div className="sechead"><h2>Posting schedule</h2><span className="chip">Eastern Time</span></div>
    <p className="small muted">{chosen?.approvedVersion === chosen?.version && chosen ? 'Approved. Choose when and where this post should go live.' : 'Approve this post before choosing a publishing time.'}</p>
    {preview === 'side' && <ScheduleMedia post={chosen}/>}
    <form onSubmit={async event => {
      event.preventDefault();
      if (!chosen || chosen.approvedVersion !== chosen.version) { setError('Approve this post before scheduling it.'); return; }
      if (!date || !platforms.length) { setError('Choose a post, date, time, and at least one platform.'); return; }
      if (platforms.some(name => !accountFor(PUBLISHING_TARGETS.find(item => item.name === name)!.api)) && !fixedTargets) {
        setError('Select an active Zernio account for every chosen platform above.'); return;
      }
      if (platforms.includes('Pinterest') && !options.Pinterest?.boardId) { setError('Choose a Pinterest board.'); return; }
      if (platforms.includes('TikTok') && (!options.TikTok?.privacyLevel || !options.TikTok?.consent)) {
        setError('Choose TikTok privacy and confirm the preview and consent.'); return;
      }
      const selectedOptions = Object.fromEntries(platforms.filter(name => options[name]).map(name => [name, options[name]]));
      if (platforms.includes('YouTube')) selectedOptions.YouTube = {
        title: String(options.YouTube?.title ?? chosen.title.slice(0, 100)),
        visibility: String(options.YouTube?.visibility || 'public'),
        madeForKids: Boolean(options.YouTube?.madeForKids),
        containsSyntheticMedia: Boolean(options.YouTube?.containsSyntheticMedia),
      };
      setError('');
      if (await command('schedule', { action: 'save', id: chosen.id, version: chosen.version,
        scheduledAt: `${date}T${time}`, platforms, platformSettings: selectedOptions })) onSaved?.();
    }}>
      <div className="schedule-fields">
        {!post && <label className="schedule-post">Post<select value={selectedId} onChange={event => choose(event.target.value)} required>
          <option value="">Choose a post</option>
          {editable.map(item => <option key={item.id} value={item.id}>{item.title} · {item.stage === 'scheduled' && item.scheduledAt ? 'Update saved schedule' : 'Approved · ready to schedule'}</option>)}
        </select></label>}
        <div className="schedule-field"><span>Date · MM/DD/YYYY</span><DatePicker value={date} onChange={setDate}/></div>
        <div className="schedule-field"><span>Time · ET</span><TimePicker value={time} onChange={setTime}/></div>
      </div>
      <fieldset className="schedule-platforms"><legend>Publish to</legend>
        {PUBLISHING_TARGETS.map(target => {
          const account = accountFor(target.api);
          return <label key={target.name} className={platforms.includes(target.name) ? 'chosen' : ''} title={account?.name || 'Select this platform’s account on Schedule first'}>
            <input type="checkbox" checked={platforms.includes(target.name)} disabled={Boolean(fixedTargets) || !account}
              onChange={event => setPlatforms(current => event.target.checked ? [...current, target.name] : current.filter(name => name !== target.name))}/>
            {target.name}
          </label>;
        })}
      </fieldset>
      {fixedTargets && <p className="small muted">To change platforms or their options, cancel this schedule first. You can update its time here.</p>}
      {platforms.includes('X') && <p className="small muted">X: {contentLength}/280 characters including hashtags.</p>}
      {platforms.includes('Pinterest') && <label className="schedule-option">Pinterest board
        <select value={String(options.Pinterest?.boardId || '')} disabled={Boolean(fixedTargets)} onChange={event => setOption('Pinterest', 'boardId', event.target.value)}>
          <option value="">Choose a board</option>
          {boards.map(board => <option key={board.id} value={board.id}>{board.name}</option>)}
        </select><small>One image or video per pin.</small>
      </label>}
      {platforms.includes('YouTube') && <><label className="schedule-option">YouTube video title
        <input maxLength={100} value={String(options.YouTube?.title ?? chosen?.title?.slice(0,100) ?? '')}
          disabled={Boolean(fixedTargets)} onChange={event => setOption('YouTube', 'title', event.target.value)}/>
      </label><label className="schedule-option">YouTube visibility
        <select value={String(options.YouTube?.visibility || 'public')} disabled={Boolean(fixedTargets)} onChange={event => setOption('YouTube', 'visibility', event.target.value)}>
          <option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option>
        </select><small>Requires a video. Check the title and visibility before saving.</small>
      </label><label className="schedule-option-check"><input type="checkbox" checked={Boolean(options.YouTube?.madeForKids)}
        disabled={Boolean(fixedTargets)} onChange={event => setOption('YouTube', 'madeForKids', event.target.checked)}/>This video is made for kids</label>
        <label className="schedule-option-check"><input type="checkbox" checked={Boolean(options.YouTube?.containsSyntheticMedia)}
          disabled={Boolean(fixedTargets)} onChange={event => setOption('YouTube', 'containsSyntheticMedia', event.target.checked)}/>Disclose realistic synthetic media</label></>}
      {platforms.includes('TikTok') && <div className="schedule-tiktok">
        <label className="schedule-option">TikTok privacy
          <select value={String(options.TikTok?.privacyLevel || '')} disabled={Boolean(fixedTargets) || !creator} onChange={event => setOption('TikTok', 'privacyLevel', event.target.value)}>
            <option value="">Choose creator privacy</option>
            {creator?.privacyLevels?.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}
          </select>
        </label>
        {(['allow_comment', ...(tikMediaType === 'video' ? ['allow_duet', 'allow_stitch'] : [])] as string[]).map(key => {
          const optionKey = key === 'allow_comment' ? 'allowComment' : key === 'allow_duet' ? 'allowDuet' : 'allowStitch';
          const allowed = creator?.postingLimits?.interactionSettings?.[key]?.enabled !== false;
          return <label key={key} className="schedule-option-check"><input type="checkbox" disabled={Boolean(fixedTargets) || !allowed}
            checked={Boolean(options.TikTok?.[optionKey]) && allowed}
            onChange={event => setOption('TikTok', optionKey, event.target.checked)}/>{key.replace('allow_', 'Allow ')}</label>;
        })}
        <label className="schedule-option">Commercial disclosure
          <select value={String(options.TikTok?.commercialContentType || 'none')} disabled={Boolean(fixedTargets)} onChange={event => setOption('TikTok', 'commercialContentType', event.target.value)}>
            {(creator?.commercialContentTypes?.length ? creator.commercialContentTypes : [
              { value: 'none', label: 'No commercial content' },
              { value: 'brand_organic', label: 'My brand' },
              { value: 'brand_content', label: 'Paid partnership' },
            ]).map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        <label className="schedule-option-check"><input type="checkbox" checked={Boolean(options.TikTok?.consent)} disabled={Boolean(fixedTargets)}
          onChange={event => setOption('TikTok', 'consent', event.target.checked)}/>
          I reviewed the final media and caption, and consent to posting them to TikTok.
        </label>
      </div>}
      {optionError && <p className="small form-error" role="alert">{optionError}</p>}
      {error && <p className="small form-error" role="alert">{error}</p>}
      <div className="tools">
        <button className="btn" disabled={pending || !state.permissions?.['schedule.manage'] || chosen?.approvedVersion !== chosen?.version || !editable.length && !post}>Save schedule</button>
        {chosen?.scheduledAt && state.permissions?.['publish.send'] && <button type="button" className="btn ghost" disabled={pending} onClick={() => void command('schedule', { action: 'cancel', id: chosen.id, version: chosen.version })}>Cancel schedule</button>}
        {chosen?.publicationStatus === 'failed' && state.permissions?.['publish.send'] && <button type="button" className="btn ghost" disabled={pending} onClick={() => void command('schedule', { action: 'retry', id: chosen.id, version: chosen.version })}>Retry schedule</button>}
      </div>
      {chosen?.publicationTargets?.map(target => <p className="small muted" key={target.id}>{target.platform} · {target.status}{target.postUrl && <> · <a href={target.postUrl} target="_blank" rel="noreferrer">View post</a></>}{target.error && <> · {target.error}</>}</p>)}
    </form>
  </section>;
}
