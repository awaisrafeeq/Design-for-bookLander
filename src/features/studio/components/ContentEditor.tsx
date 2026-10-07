'use client';
import { useEffect, useState } from 'react';
import { useStudio } from './StudioProvider';
import { Icon } from './Icon';
import type { Format, Platform, Post } from '../types';

export function ContentEditor({ post, readOnly = false }: { post: Post; readOnly?: boolean }) {
  const { state, command, upload, pending } = useStudio();
  const [caption, setCaption] = useState(post.caption || '');
  const [tags, setTags] = useState(post.tags || '');
  const [script, setScript] = useState(post.script || '');
  const [videoDirection, setVideoDirection] = useState(post.videoDirection || '');
  const [mediaBrief, setMediaBrief] = useState(post.mediaBrief || '');
  const [note, setNote] = useState(post.note || '');
  const [instruction, setInstruction] = useState('');
  useEffect(() => { setCaption(post.caption || ''); setTags(post.tags || ''); setScript(post.script || ''); setVideoDirection(post.videoDirection || ''); setMediaBrief(post.mediaBrief || ''); setNote(post.note || ''); }, [post.id, post.version, post.caption, post.tags, post.script, post.videoDirection, post.mediaBrief, post.note]);
  useEffect(() => setInstruction(''), [post.id]);
  const can = (permission: string) => !readOnly && state.permissions?.[permission] === true;
  const draft = { caption, tags, script, videoDirection, mediaBrief, ...(post.note ? {note} : {}) };
  const dirty = Object.entries(draft).some(([key,value]) => value !== (post[key as keyof Post] || ''));
  async function save() {
    let version = post.version || 1;
    const ok = await command('posts', {action:'update',id:post.id,version:post.version,...draft}, result => { version = Number(result.version) || version; });
    return ok ? version : null;
  }
  async function generateMedia() {
    const version = dirty ? await save() : post.version || 1;
    if (version !== null) await command('posts', {action:'generate-media',id:post.id,version});
  }
  return <section className="card pad sec content-editor">
    <b>{readOnly ? 'Saved content' : 'Content'}</b>
    <div className="editor-format"><label>Format<select value={post.format} disabled={pending || !can('content.edit')} onChange={event => void command('posts', {action:'configure',id:post.id,version:post.version,format:event.target.value as Format,platform:post.platform})}><option value="image">Image</option><option value="carousel">Carousel</option><option value="video">Video</option></select></label><label>Platform<select value={post.platform} disabled={pending || !can('content.edit')} onChange={event => void command('posts', {action:'configure',id:post.id,version:post.version,format:post.format,platform:event.target.value as Platform})}><option>Instagram</option><option>Facebook</option></select></label></div>
    {post.note && <label>Your idea input<textarea rows={3} maxLength={1000} value={note} readOnly={!can('content.edit')} onChange={event => setNote(event.target.value)}/></label>}
    <label>Caption<textarea rows={5} value={caption} readOnly={!can('content.edit')} onChange={event => setCaption(event.target.value)} placeholder="Write a caption or generate a draft"/></label>
    <label>Hashtags<input value={tags} readOnly={!can('content.edit')} onChange={event => setTags(event.target.value)} placeholder="Optional hashtags"/></label>
    {post.format === 'video' ? <><label>Voiceover script<textarea rows={4} value={script} readOnly={!can('content.edit')} onChange={event => setScript(event.target.value)} placeholder="Only the words the narrator should speak"/></label><label>Video direction<textarea rows={5} value={videoDirection} readOnly={!can('content.edit')} onChange={event => setVideoDirection(event.target.value)} placeholder="Scenes, actions, camera, lighting, and mood. This guides visuals and is not spoken."/></label></> : <label>Media brief<textarea rows={3} value={mediaBrief} readOnly={!can('content.edit')} onChange={event => setMediaBrief(event.target.value)} placeholder="Describe the image or carousel"/></label>}
    {!readOnly && <><label>Instructions for AI <span className="muted">Optional</span><textarea rows={2} maxLength={1000} value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="e.g. Make the caption shorter and focus on the book's money lesson"/></label><div className="editor-actions"><button className="btn" disabled={pending || !can('content.edit') || !caption.trim()} onClick={() => void save()}>{post.media?.length ? 'Save for review' : 'Save draft'}</button><button className="btn ai" disabled={pending || !can('content.generate') || !can('content.edit')} onClick={() => void command('posts', {action:post.caption ? 'revise' : 'generate',id:post.id,version:post.version,note:instruction,draft})}><Icon name="spark"/>{post.caption ? 'AI regenerate' : 'AI caption'}</button></div><p className="small muted">AI uses this draft and your optional instructions. Text-only drafts stay Selected until media is attached.</p>
    <b>Media</b><label className="small">Upload image or video<input type="file" accept={post.format === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp'} disabled={pending || !can('media.upload')} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(post.id, post.version || 1, file); event.target.value = ''; }}/></label>
    {post.media?.map((asset,index) => <div className="tools" key={asset.id}><span className="small">Attachment {index+1} · {asset.type}</span><button className="btn ghost sm" disabled={pending || !can('media.upload')} onClick={() => void command('posts',{action:'remove-media',id:post.id,version:post.version,assetId:asset.id})}>Remove</button></div>)}
    <button className="btn ai" disabled={pending || !can('media.generate') || !caption.trim() || dirty && !can('content.edit')} onClick={() => void generateMedia()}><Icon name="spark"/>{post.format === 'video' ? 'Generate video' : post.format === 'carousel' ? 'Generate carousel' : 'Generate image'}</button>
    {post.brandChecks?.passed === false && <div className="brand-check-result"><b>Brand phrases to fix</b>{post.brandChecks.violations.map((item,index) => <p className="small" key={index}>{item.rule}: “{item.match}”</p>)}</div>}</>}
  </section>;
}
