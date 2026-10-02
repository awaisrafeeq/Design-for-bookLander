'use client';
import { useEffect, useState } from 'react';
import { useStudio } from './StudioProvider';
import { Icon } from './Icon';
import type { Format, Platform, Post } from '../types';

export function ContentEditor({ post }: { post: Post }) {
  const { state, command, upload, pending } = useStudio();
  const [caption, setCaption] = useState(post.caption || '');
  const [tags, setTags] = useState(post.tags || '');
  const [script, setScript] = useState(post.script || '');
  const [mediaBrief, setMediaBrief] = useState(post.mediaBrief || '');
  useEffect(() => { setCaption(post.caption || ''); setTags(post.tags || ''); setScript(post.script || ''); setMediaBrief(post.mediaBrief || ''); }, [post.id, post.version, post.caption, post.tags, post.script, post.mediaBrief]);
  const can = (permission: string) => state.permissions?.[permission] === true;
  return <section className="card pad sec content-editor">
    <b>Content</b>
    <div className="publishing-accounts"><label>Format<select value={post.format} disabled={pending || !can('content.edit')} onChange={event => void command('posts', { action: 'configure', id: post.id, version: post.version, format: event.target.value as Format, platform: post.platform })}><option value="image">Image</option><option value="carousel">Carousel</option><option value="video">Video</option></select></label><label>Platform<select value={post.platform} disabled={pending || !can('content.edit')} onChange={event => void command('posts', { action: 'configure', id: post.id, version: post.version, format: post.format, platform: event.target.value as Platform })}><option>Instagram</option><option>Facebook</option></select></label></div>
    <label>Caption<textarea rows={5} value={caption} disabled={!can('content.edit')} onChange={event => setCaption(event.target.value)} placeholder="Write a caption or generate a draft"/></label>
    <label>Hashtags<input value={tags} disabled={!can('content.edit')} onChange={event => setTags(event.target.value)} placeholder="Optional hashtags"/></label>
    {post.format === 'video' && <label>Video script<textarea rows={4} value={script} disabled={!can('content.edit')} onChange={event => setScript(event.target.value)} placeholder="Avatar narration; caption is used if left empty"/></label>}
    {post.format !== 'video' && <label>Media brief<textarea rows={3} value={mediaBrief} disabled={!can('content.edit')} onChange={event => setMediaBrief(event.target.value)} placeholder="Describe the image or carousel"/></label>}
    <div className="tools"><button className="btn" disabled={pending || !can('content.edit') || !caption.trim()} onClick={() => void command('posts', { action: 'update', id: post.id, version: post.version, caption, tags, script, mediaBrief })}>Save for review</button>{post.stage === 'selected' && <button className="btn ai" disabled={pending || !can('content.generate')} onClick={() => void command('posts', { action: 'generate', id: post.id, version: post.version })}><Icon name="spark"/>AI caption</button>}</div>
    <b>Media</b><label className="small">Upload image or video<input type="file" accept={post.format === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp'} disabled={pending || !can('media.upload')} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(post.id, post.version || 1, file); event.target.value = ''; }}/></label>
    {post.media?.map((asset, index) => <div className="tools" key={asset.id}><span className="small">Attachment {index + 1} · {asset.type}</span><button className="btn ghost sm" disabled={pending || !can('media.upload')} onClick={() => void command('posts', { action: 'remove-media', id: post.id, version: post.version, assetId: asset.id })}>Remove</button></div>)}
    <button className="btn ai" disabled={pending || !can('media.generate') || !post.caption} onClick={() => void command('posts', { action: 'generate-media', id: post.id, version: post.version })}><Icon name="spark"/>{post.format === 'video' ? 'Generate video' : post.format === 'carousel' ? 'Generate carousel' : 'Generate image'}</button>
    {post.brandChecks && <div className="brand-check-result"><b>{post.brandChecks.passed ? 'Phrase checks passed' : 'Brand issues to fix'}</b>{post.brandChecks.violations.map((item, index) => <p className="small" key={index}>{item.rule}: “{item.match}”</p>)}<p className="small muted">Human tone and factual review still required.</p></div>}
  </section>;
}
