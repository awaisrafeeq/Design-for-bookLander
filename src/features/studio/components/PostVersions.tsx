'use client';
import { useEffect, useState } from 'react';
import type { Post } from '../types';

export function usePostVersion(post: Post) {
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => setSelected(null), [post.id]);
  const entry = post.history?.find(item => item.version === selected);
  const historical = selected !== null && selected !== post.version && Boolean(entry?.payload);
  const shown: Post = historical ? {
    ...post, caption: undefined, tags: undefined, script: undefined, videoDirection: undefined,
    mediaBrief: undefined, media: [], note: undefined, scheduledAt: undefined, time: undefined,
    day: undefined, error: undefined, generationKind: undefined, publicationTargets: [],
    brandChecks: undefined, warning: undefined, ...entry!.payload,
    version: entry!.version, stage: entry!.stage || (entry!.payload?.media?.length ? 'review' : 'selected'),
    approvedVersion: undefined,
  } : post;
  return { shown, historical, selected, setSelected };
}

export function VersionPicker({ post, selected, onChange }: { post: Post; selected: number | null; onChange: (version: number | null) => void }) {
  const history = [...(post.history || [])].sort((a, b) => b.version - a.version);
  return <section className="version-picker"><label>Version history<select value={selected ?? post.version ?? 1} onChange={event => onChange(Number(event.target.value) === (post.version || 1) ? null : Number(event.target.value))}>
    <option value={post.version || 1}>v{post.version || 1} · {post.stage} · {post.versionReason || 'Current version'}</option>
    {history.map(item => <option key={item.version} value={item.version} disabled={!item.payload}>v{item.version} · {item.stage || 'Stage not recorded'} · before {item.reason}{!item.payload ? ' · Preview unavailable' : ''}</option>)}
  </select></label>{selected !== null && selected !== post.version && <p className="small muted">Viewing a saved version. Select the current version to edit, approve, or schedule.</p>}</section>;
}
