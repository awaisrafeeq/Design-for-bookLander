'use client';
import { useEffect, useState } from 'react';
import { studioApi, type LibraryAsset } from '../api';
import { useStudio } from '../components/StudioProvider';

export default function MediaLibraryPage() {
  const { notify, state } = useStudio();
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [nextCursor,setNextCursor] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = async () => { const result = await studioApi.library(); setAssets(result.assets); setNextCursor(result.nextCursor); };
  const loadMore = async () => { if (!nextCursor) return; setBusy(true); try { const result=await studioApi.library(nextCursor); setAssets(current=>[...current,...result.assets]); setNextCursor(result.nextCursor); } catch(error) {setError((error as Error).message);} finally {setBusy(false);} };
  useEffect(() => { void refresh().catch(error => setError((error as Error).message)); }, []);
  const upload = async () => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const body = new FormData(); body.set('file', file); body.set('name', name.trim() || file.name);
      const result = await studioApi.uploadToLibrary(body);
      await refresh(); setFile(null); setName(''); notify(result.message);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };
  return <><section className="card pad sec"><h2>Reusable media</h2><p className="small muted">Upload finished images and videos once. In an editable post, choose “Attach from library” to reuse one. The library keeps its own copy.</p>
    <div className="grid2"><label>File<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" disabled={busy || !state.permissions?.['media.upload']} onChange={event=>setFile(event.target.files?.[0] || null)}/></label><label>Name<input value={name} maxLength={160} disabled={busy || !state.permissions?.['media.upload']} onChange={event=>setName(event.target.value)} placeholder={file?.name || 'Media name'}/></label></div>
    <button className="btn" disabled={!file || busy || !state.permissions?.['media.upload']} onClick={()=>void upload()}>{busy?'Uploading…':'Upload to library'}</button>{error && <p role="alert">{error}</p>}
  </section><section className="card pad sec"><h2>Saved media</h2>{assets.length ? <div className="library-grid">{assets.map(asset=><article className="library-card" key={asset.id}>{asset.type==='video'?<video src={asset.url} controls preload="metadata"/>:<img src={asset.url} alt={asset.name}/>}<b>{asset.name}</b><span className="small muted">{asset.type} · {(asset.size/1024/1024).toFixed(1)} MB</span></article>)}</div>:<p className="muted">No media uploaded yet.</p>}{nextCursor && <button className="btn ghost" disabled={busy} onClick={()=>void loadMore()}>Load more media</button>}</section></>;
}
