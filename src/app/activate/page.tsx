'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

type ApiMessage = { detail?: string; error?: string; message?: string };

export default function ActivateInvitationPage() {
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    setToken(params.get('token') || '');
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!token) return setError('This invitation link is missing its token. Ask an admin for a new link.');
    if (password !== confirmPassword) return setError('The passwords do not match.');
    setPending(true);
    try {
      const response = await fetch('/api/auth/activate-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, ...(name.trim() ? { name: name.trim() } : {}) }),
      });
      const result = await response.json() as ApiMessage;
      if (!response.ok) throw new Error(result.detail || result.error || 'Could not activate this invitation.');
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not activate this invitation.');
    } finally {
      setPending(false);
    }
  }

  return <main className="login-wrap"><form className="card pad login-card" onSubmit={submit}>
    <span className="chip">BookLender Studio</span>
    {done ? <><h1>Account ready</h1><p className="muted">Your password is set. Sign in to continue.</p><Link className="btn lg" href="/login">Go to sign in</Link></> : <>
      <h1>Activate your account</h1>
      <p className="muted">Choose your name and a password with at least 12 characters.</p>
      <label htmlFor="name">Name</label><input id="name" autoComplete="name" minLength={2} maxLength={160} value={name} onChange={event => setName(event.target.value)}/>
      <label htmlFor="password">Password</label><input id="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={password} onChange={event => setPassword(event.target.value)}/>
      <label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)}/>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button className="btn lg" type="submit" disabled={pending}>{pending ? 'Activating…' : 'Set password and activate'}</button>
    </>}
  </form></main>;
}
