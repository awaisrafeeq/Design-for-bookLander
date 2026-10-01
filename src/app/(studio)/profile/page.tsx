'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Header, Icon } from '@/features/studio/components/Design';

type UserProfile = { id: string; email: string; name: string; role: string };
type ApiMessage = { detail?: string; error?: string; user?: UserProfile };

async function csrfHeader() {
  const response = await fetch('/api/auth/csrf', { cache: 'no-store' });
  const result = await response.json() as { csrf_token?: string; detail?: string };
  if (!response.ok || !result.csrf_token) throw new Error(result.detail || 'Your session expired. Sign in again.');
  return { 'X-CSRF-Token': result.csrf_token };
}

async function send<T>(path: string, body: Record<string, string>): Promise<T> {
  const headers = await csrfHeader();
  const response = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const result = await response.json() as ApiMessage & T;
  if (!response.ok) throw new Error(result.detail || result.error || 'Could not save changes.');
  return result;
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async response => {
        const result = await response.json() as UserProfile & ApiMessage;
        if (!response.ok) throw new Error(result.detail || 'Could not load your profile.');
        if (active) { setUser(result); setName(result.name); }
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load your profile.'); });
    return () => { active = false; };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage(''); setError('');
    try {
      const result = await send<UserProfile>('/profile', { name: name.trim() });
      setUser(result); setName(result.name); setMessage('Profile updated.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update your profile.'); }
    finally { setPending(false); }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setError('');
    if (newPassword !== confirmPassword) { setError('The new passwords do not match.'); return; }
    setPending(true);
    try {
      await send('/password', { current_password: currentPassword, new_password: newPassword });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setMessage('Password updated. Other signed-in sessions have been closed.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update your password.'); }
    finally { setPending(false); }
  }

  return <>
    <section className="card pad sec">
      <Header title="Your profile"><span className="chip"><Icon name="shield"/>{user?.role?.replaceAll('_', ' ') || 'Loading'}</span></Header>
      <form className="profile-form" onSubmit={saveProfile}>
        <label htmlFor="profile-name">Name</label>
        <input id="profile-name" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={160} required />
        <label htmlFor="profile-email">Email</label>
        <input id="profile-email" value={user?.email || ''} readOnly aria-readonly="true" />
        <small className="muted">Contact an administrator if your email needs to change.</small>
        <button className="btn" type="submit" disabled={pending || !user}><Icon name="check"/>Save profile</button>
      </form>
    </section>
    <section className="card pad sec">
      <Header title="Change password"/>
      <form className="profile-form" onSubmit={savePassword}>
        <label htmlFor="current-password">Current password</label>
        <input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required />
        <label htmlFor="new-password">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={event => setNewPassword(event.target.value)} required />
        <small className="muted">Use at least 12 characters.</small>
        <label htmlFor="confirm-password">Confirm new password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required />
        <button className="btn" type="submit" disabled={pending || !user}><Icon name="lock"/>Update password</button>
      </form>
    </section>
    {(message || error) && <p className={error ? 'login-error' : 'muted'} role={error ? 'alert' : 'status'}>{error || message}</p>}
  </>;
}
