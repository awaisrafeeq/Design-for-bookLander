'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { studioApi, type Resource } from '../api';
import { createSeed } from '../seed';
import type { StudioState } from '../types';

interface StudioContextValue {
  state: StudioState;
  pending: boolean;
  drawerId: number | null;
  openPost: (id: number | null) => void;
  notify: (message: string, bad?: boolean) => void;
  command: (resource: Resource, input: Record<string, unknown>, onSuccess?: (result: Record<string, unknown>) => void) => Promise<boolean>;
  upload: (postId: number, version: number, file: File) => Promise<void>;
}
const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(createSeed);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [drawerId, openPost] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; bad?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string, bad?: boolean) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, bad }); toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  const reload = useCallback(async () => { setState(await studioApi.get('snapshot')); setLoaded(true); setLoadError(false); }, []);
  useEffect(() => { void reload().catch(() => setLoadError(true)); return () => { if (toastTimer.current) clearTimeout(toastTimer.current); }; }, [reload]);
  const generating = state.posts.some(post => ['generating', 'revision'].includes(post.stage) || ['queued', 'scheduled', 'publishing', 'cancelling'].includes(post.publicationStatus || '')) || state.activity.some(item => ['queued', 'running', 'waiting', 'retry_pending'].includes(item.status || ''));
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => { void reload().catch(() => {}); }, 5000);
    return () => clearInterval(timer);
  }, [generating, reload]);
  const command = useCallback(async (resource: Resource, input: Record<string, unknown>, onSuccess?: (result: Record<string, unknown>) => void) => {
    setPending(true);
    try {
      const result = await studioApi.act<Record<string, unknown> & { message?: string }>(resource, input);
      await reload(); if (result.message) notify(result.message); onSuccess?.(result); return true;
    } catch (error) { notify((error as Error).message, true); return false; }
    finally { setPending(false); }
  }, [reload, notify]);
  const upload = useCallback(async (postId: number, version: number, file: File) => {
    setPending(true);
    try {
      const body = new FormData(); body.set('post_id', String(postId)); body.set('version', String(version)); body.set('file', file);
      const result = await studioApi.upload(body); await reload(); notify(result.message);
    } catch (error) { notify((error as Error).message, true); }
    finally { setPending(false); }
  }, [reload, notify]);
  return <StudioContext.Provider value={{ state, pending, drawerId, openPost, notify, command, upload }}>{loaded ? children : <main className="page"><section className="card pad" role="status">{loadError ? <><p>Could not load Studio. Check your connection or sign in again.</p><button className="btn" onClick={() => void reload().catch(() => setLoadError(true))}>Retry</button></> : 'Loading Studio…'}</section></main>}<div className={`toast ${toast ? 'show' : ''} ${toast?.bad ? 'bad' : ''}`} role="status" aria-live="polite">{toast?.message}</div></StudioContext.Provider>;
}
export function useStudio() { const value = useContext(StudioContext); if (!value) throw new Error('StudioProvider is required'); return value; }
