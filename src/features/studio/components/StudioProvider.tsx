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
}
const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(createSeed);
  const [pending, setPending] = useState(false);
  const [drawerId, openPost] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; bad?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string, bad?: boolean) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, bad }); toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  const reload = useCallback(async () => { setState(await studioApi.get('snapshot')); }, []);
  useEffect(() => { void reload().catch(() => notify('Could not refresh studio data. Try again.', true)); return () => { if (toastTimer.current) clearTimeout(toastTimer.current); }; }, [reload, notify]);
  const generating = state.posts.some(post => ['generating', 'revision'].includes(post.stage));
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => { void reload().catch(() => {}); }, 1200);
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
  return <StudioContext.Provider value={{ state, pending, drawerId, openPost, notify, command }}>{children}<div className={`toast ${toast ? 'show' : ''} ${toast?.bad ? 'bad' : ''}`} role="status" aria-live="polite">{toast?.message}</div></StudioContext.Provider>;
}
export function useStudio() { const value = useContext(StudioContext); if (!value) throw new Error('StudioProvider is required'); return value; }
