'use client';
import { useEffect, useState } from 'react';
import { useStudio } from './StudioProvider';
import { Icon } from './Icon';
import { studioApi, type LibraryAsset, type Voices, type PostTemplates } from '../api';
import type { Format, Platform, Post } from '../types';
import { PUBLISHING_TARGETS } from '../publishing';

export function ContentEditor({ post, readOnly = false }: { post: Post; readOnly?: boolean }) {
  const { state, command, upload, pending } = useStudio();
  const [caption, setCaption] = useState(post.caption || '');
  const [tags, setTags] = useState(post.tags || '');
  const [script, setScript] = useState(post.script || '');
  const [voiceAccent, setVoiceAccent] = useState(post.voiceAccent || '');
  const [voices, setVoices] = useState<Voices | null>(null);
  const [voiceError, setVoiceError] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([]);
  const [libraryCursor, setLibraryCursor] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState('');
  const [videoDirection, setVideoDirection] = useState(post.videoDirection || '');
  const [mediaBrief, setMediaBrief] = useState(post.mediaBrief || '');
  const [note, setNote] = useState(post.note || '');
  const [instruction, setInstruction] = useState('');
  const [templates,setTemplates]=useState<PostTemplates|null>(null);
  const [textTemplate,setTextTemplate]=useState(post.textTemplate||'standard');
  const [videoTemplate,setVideoTemplate]=useState(post.videoTemplate||'editorial');
  useEffect(()=>{void studioApi.get('templates').then(setTemplates).catch(()=>setTemplates(null));},[]);
  useEffect(() => { setCaption(post.caption || ''); setTags(post.tags || ''); setScript(post.script || ''); setVoiceAccent(post.voiceAccent || ''); setVideoDirection(post.videoDirection || ''); setMediaBrief(post.mediaBrief || ''); setNote(post.note || ''); setTextTemplate(post.textTemplate||'standard'); setVideoTemplate(post.videoTemplate||'editorial'); }, [post.id, post.version, post.caption, post.tags, post.script, post.voiceAccent, post.videoDirection, post.mediaBrief, post.note, post.textTemplate, post.videoTemplate]);
  useEffect(() => {
    if (post.format !== 'video') return;
    let alive = true;
    void studioApi.get('voices').then(result => { if (alive) { setVoices(result); setVoiceError(''); } })
      .catch(() => { if (alive) setVoiceError('Could not load Creatify voices. The configured default remains available.'); });
    return () => { alive = false; };
  }, [post.format]);
  useEffect(() => setInstruction(''), [post.id]);
  const can = (permission: string) => !readOnly && state.permissions?.[permission] === true;
  const draft = { caption, tags, script, videoDirection, mediaBrief, ...(post.format === 'video' ? {voiceAccent} : {}), ...(post.note ? {note} : {}) };
  const selectedVoice = voices?.voices.find(voice => voice.id === (voiceAccent || voices.defaultAccent));
  const dirty = Object.entries(draft).some(([key,value]) => value !== (post[key as keyof Post] || ''));
  async function save() {
    let version = post.version || 1;
    const ok = await command('posts', {action:'update',id:post.id,version:post.version,...draft}, result => { version = Number(result.version) || version; });
    return ok ? version : null;
  }
  async function generateMedia() {
    const version = dirty ? await save() : post.version || 1;
    if (version !== null) await command('posts', {action:'generate-media',id:post.id,version,videoTemplate});
  }
  return <section className="card pad sec content-editor">
    <b>{readOnly ? 'Saved content' : 'Content'}</b>
    <div className="editor-format"><label>Format<select value={post.format} disabled={pending || !can('content.edit')} onChange={event => void command('posts', {action:'configure',id:post.id,version:post.version,format:event.target.value as Format,platform:post.platform})}><option value="image" disabled={post.platform==='YouTube'}>Image</option><option value="carousel" disabled={post.platform==='YouTube'||post.platform==='Pinterest'}>Carousel</option><option value="video">Video</option></select></label><label>Primary platform<select value={post.platform} disabled={pending || !can('content.edit')} onChange={event => void command('posts', {action:'configure',id:post.id,version:post.version,format:post.format,platform:event.target.value as Platform})}>{PUBLISHING_TARGETS.map(target => <option key={target.name} disabled={target.name==='YouTube'&&post.format!=='video'||target.name==='Pinterest'&&post.format==='carousel'}>{target.name}</option>)}</select></label></div>
    {post.note && <label>Your idea input<textarea rows={3} maxLength={1000} value={note} readOnly={!can('content.edit')} onChange={event => setNote(event.target.value)}/></label>}
    <label>Caption<textarea rows={5} value={caption} readOnly={!can('content.edit')} onChange={event => setCaption(event.target.value)} placeholder="Write a caption or generate a draft"/></label>
    <label>Hashtags<input value={tags} readOnly={!can('content.edit')} onChange={event => setTags(event.target.value)} placeholder="Optional hashtags"/></label>
    {post.format === 'video' ? <><label>Voiceover script<textarea rows={4} value={script} readOnly={!can('content.edit')} onChange={event => setScript(event.target.value)} placeholder="Only the words the narrator should speak"/></label><label>Video direction<textarea rows={5} value={videoDirection} readOnly={!can('content.edit')} onChange={event => setVideoDirection(event.target.value)} placeholder="Scenes, actions, camera, lighting, and mood. This guides visuals and is not spoken."/></label>
      <label>Video voice<select value={voiceAccent || voices?.defaultAccent || ''} disabled={!can('content.edit') || !voices?.voices.length} onChange={event => setVoiceAccent(event.target.value)}>
        {(!voices?.voices.length || !voices?.defaultAccent) && <option value={voices?.defaultAccent || ''}>{voices?.defaultAccent?'Configured default voice':'Choose a voice'}</option>}
        {voices?.defaultAccent && !voices.voices.some(voice=>voice.id===voices.defaultAccent) && <option value={voices.defaultAccent}>Configured default voice</option>}
        {voices?.voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name} · {voice.accent}{voice.gender ? ` · ${voice.gender}` : ''}</option>)}
      </select></label>{voiceError && <p className="small muted">{voiceError}</p>}
      {selectedVoice?.previewUrl && <div className="voice-preview"><span className="small">Hear {selectedVoice.name}'s sample</span><audio controls preload="none" src={selectedVoice.previewUrl}/></div>}
      <p className="small muted">Voice samples are supplied by Creatify. Save the draft or generate video to use the selected voice.</p></> : <label>Media brief<textarea rows={3} value={mediaBrief} readOnly={!can('content.edit')} onChange={event => setMediaBrief(event.target.value)} placeholder="Describe the image or carousel"/></label>}
    {!readOnly && <><div className="editor-format"><label>Writing style<select value={textTemplate} onChange={event=>setTextTemplate(event.target.value)}>{(templates?.text||[{id:'standard',name:'Standard'}]).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{post.format==='video'&&<label>Video style<select value={videoTemplate} onChange={event=>setVideoTemplate(event.target.value)}>{(templates?.video||[{id:'editorial',name:'Editorial b-roll'}]).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</div><p className="small muted">BookLender styles guide new AI output. Review every draft before approval.</p><label>Instructions for AI <span className="muted">Optional</span><textarea rows={2} maxLength={1000} value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="e.g. Make the caption shorter and focus on the book's money lesson"/></label><div className="editor-actions"><button className="btn" disabled={pending || !can('content.edit') || !caption.trim()} onClick={() => void save()}>{post.media?.length ? 'Save for review' : 'Save draft'}</button><button className="btn ai" disabled={pending || !can('content.generate') || !can('content.edit')} onClick={() => void command('posts', {action:post.caption ? 'revise' : 'generate',id:post.id,version:post.version,note:instruction,draft,textTemplate})}><Icon name="spark"/>{post.caption ? 'AI regenerate' : 'AI caption'}</button></div><p className="small muted">AI uses this draft and your optional instructions. Text-only drafts stay Selected until media is attached.</p>
    <b>Media</b><label className="small">Upload from your computer<input type="file" accept={post.format === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp'} disabled={pending || !can('media.upload')} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(post.id, post.version || 1, file); event.target.value = ''; }}/></label>
    <button className="btn ghost sm" disabled={pending || !can('media.upload')} onClick={()=>{if(libraryOpen){setLibraryOpen(false);return;}setLibraryOpen(true);setLibraryError('');void studioApi.library().then(result=>{setLibraryAssets(result.assets);setLibraryCursor(result.nextCursor)}).catch(error=>setLibraryError((error as Error).message));}}>Attach from library</button>
    {libraryOpen && <div><p className="small muted">Choose a saved {post.format==='video'?'video':'image'}.</p>{libraryError && <p role="alert">{libraryError}</p>}<div className="library-picker">{libraryAssets.filter(asset=>asset.type===(post.format==='video'?'video':'image')).map(asset=><button key={asset.id} disabled={pending} onClick={async()=>{if(await command('library',{action:'attach',assetId:asset.id,postId:post.id,version:post.version}))setLibraryOpen(false)}}>{asset.type==='video'?<video src={asset.url} preload="metadata"/>:<img src={asset.url} alt=""/>}<b>{asset.name}</b></button>)}</div>{libraryCursor && <button className="btn ghost sm" disabled={pending} onClick={()=>void studioApi.library(libraryCursor).then(result=>{setLibraryAssets(current=>[...current,...result.assets]);setLibraryCursor(result.nextCursor)}).catch(error=>setLibraryError((error as Error).message))}>Load more</button>}{!libraryAssets.length && !libraryCursor && !libraryError && <p className="small muted">No saved media. Upload one on Media library first.</p>}</div>}
    {post.media?.map((asset,index) => <div className="tools" key={asset.id}><span className="small">Attachment {index+1} · {asset.type}</span><button className="btn ghost sm" disabled={pending || !can('media.upload')} onClick={() => void command('posts',{action:'remove-media',id:post.id,version:post.version,assetId:asset.id})}>Remove</button></div>)}
    <button className="btn ai" disabled={pending || !can('media.generate') || !caption.trim() || dirty && !can('content.edit')} onClick={() => void generateMedia()}><Icon name="spark"/>{post.format === 'video' ? 'Generate video' : post.format === 'carousel' ? 'Generate carousel' : 'Generate image'}</button>
    {post.brandChecks?.passed === false && <div className="brand-check-result"><b>Brand phrases to fix</b>{post.brandChecks.violations.map((item,index) => <p className="small" key={index}>{item.rule}: “{item.match}”</p>)}</div>}</>}
  </section>;
}
