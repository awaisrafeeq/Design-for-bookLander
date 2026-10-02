'use client';

import { useState, type FormEvent } from 'react';
import { useStudio } from '../components/StudioProvider';
import { actionPermissions } from '../permissions';
import { Header, Icon } from '../components/Design';
import { modules, roles } from '../domain';
import type { TeamMember } from '../types';

export default function TeamPage() {
  const { state, command, pending, notify } = useStudio();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamMember['role']>('Campaigns manager');
  const [inviteApprover, setInviteApprover] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [permissionUserId, setPermissionUserId] = useState('');
  const permissionUser = state.team.find(member => String(member.id) === permissionUserId);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await command('team', { action: 'invite', email, role, isApprover: inviteApprover }, result => {
      if (typeof result.activationToken === 'string') {
        const link = new URL('/activate', window.location.origin);
        link.hash = new URLSearchParams({ token: result.activationToken }).toString();
        setInviteLink(link.toString());
      }
    })) setEmail('');
  }

  return <>
    <div className="two">
      <section className="card pad sec">
        <Header title="People"><span className="chip r"><Icon name="shield"/>Only an admin adds people</span></Header>
        <div>
          {state.team.map(member => <div className="tg" key={member.id}>
            <span className="av2">{member.initials}</span>
            <span className="t">
              <b>{member.name}{member.invited && <span className="chip amber">Invite pending</span>}</b>
              <small>{member.email}{member.roleTitles?.length ? ` · ${member.roleTitles.join(' + ')}` : ''}</small>
              {member.invited && <button className="btn ghost sm" disabled={pending} onClick={() => void command('team', { action: 'resend', id: member.id }, result => {
                if (typeof result.activationToken === 'string') { const link = new URL('/activate', window.location.origin); link.hash = new URLSearchParams({ token: result.activationToken }).toString(); setInviteLink(link.toString()); }
              })}>Send / resend invitation</button>}
              <button className={`chip ${member.isApprover ? 'ai' : ''}`} disabled={pending || member.role === 'Super admin'} aria-label={`${member.isApprover ? 'Remove' : 'Make'} ${member.name} an approver`} onClick={() => void command('team', { action: 'approver', id: member.id, value: !member.isApprover })}>
                {member.isApprover ? 'Approver · Remove' : 'Make approver'}
              </button>
            </span>
            <select value={member.role} disabled={pending || member.role === 'Super admin'} style={{ width: 'auto', minWidth: 150 }} aria-label={`Role for ${member.name}`} onChange={event => void command('team', { action: 'role', id: member.id, role: event.target.value })}>
              {Object.keys(roles).map(value => <option key={value}>{value}</option>)}
            </select>
          </div>)}
        </div>
        <form className="addtopic" style={{ maxWidth: 'none', flexWrap: 'wrap' }} onSubmit={invite}>
          <input type="email" placeholder="Email address" aria-label="Email address" value={email} onChange={event => setEmail(event.target.value)} style={{ flex: 2, minWidth: 200 }} required />
          <select aria-label="Role" value={role} onChange={event => setRole(event.target.value as TeamMember['role'])} style={{ flex: 1, minWidth: 140 }}>
            {Object.keys(roles).filter(value => value !== 'Super admin').map(value => <option key={value}>{value}</option>)}
          </select>
          <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={inviteApprover} onChange={event => setInviteApprover(event.target.checked)} style={{ width: 16, minHeight: 16 }} />Can approve
          </label>
          <button className="btn" disabled={pending}><Icon name="plus"/>Invite</button>
        </form>
        {inviteLink ? <div className="card pad sec"><b>Activation link · expires in 48 hours</b><p className="small muted">Send this one-time link to the invitee through your approved secure channel.</p><div className="addtopic" style={{ maxWidth: 'none' }}><input readOnly aria-label="One-time activation link" value={inviteLink}/><button className="btn ghost" type="button" onClick={() => void navigator.clipboard.writeText(inviteLink).then(() => notify('Activation link copied')).catch(() => notify('Could not copy link', true))}><Icon name="send"/>Copy</button><button className="btn ghost" type="button" onClick={() => setInviteLink('')} aria-label="Hide activation link"><Icon name="x"/></button></div></div> : <p className="small muted">Email invitations use the configured SMTP sender. If delivery is unavailable, a one-time link is provided.</p>}
      </section>
      <section className="card pad sec">
        <Header title="Ready-made roles"/>
        <div>{Object.entries(roles).map(([name, access]) => <div className="tg" key={name}>
          <span className="t"><b>{name}</b><small>{access.length === modules.length ? 'Everything, and adds people' : access.join(', ')}</small></span>
          <span className="chip">{access.length} of {modules.length}</span>
        </div>)}</div>
      </section>
    </div>
    <section className="card pad sec">
      <Header title="Action permissions"/>
      <select aria-label="Choose a person to manage permissions" value={permissionUserId} onChange={event => setPermissionUserId(event.target.value)}><option value="">Choose a person</option>{state.team.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
      {permissionUser && <><p className="small muted">Module access and action permission must both be enabled.</p><div className="permission-grid">{Object.entries(actionPermissions).map(([key, label]) => <label key={key}><input type="checkbox" checked={permissionUser.permissions?.[key] || permissionUser.role === 'Super admin'} disabled={pending || permissionUser.role === 'Super admin'} onChange={event => void command('team', { action: 'permission', id: permissionUser.id, permission: key, value: event.target.checked })}/>{label}</label>)}</div></>}
    </section>
    <section className="card pad sec">
      <Header title="Who can open what"><span className="small muted r">Tap a box to change</span></Header>
      <div className="tblwrap"><table className="tbl mx">
        <thead><tr><th>Person</th>{modules.map(module => <th key={module}>{module}</th>)}</tr></thead>
        <tbody>{state.team.map(member => <tr key={member.id}>
          <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{member.name.split(' ')[0]}<br/><span className="small muted" style={{ fontWeight: 500 }}>{member.role}{member.isApprover ? ' · approver' : ''}</span></td>
          {modules.map(module => {
            const on = member.modules.includes(module);
            return <td key={module}><button className={on ? 'on' : ''} disabled={pending || member.role === 'Super admin'} aria-label={`${member.name} ${module} ${on ? 'on' : 'off'}`} onClick={() => void command('team', { action: 'access', id: member.id, module })}>{on && <Icon name="check"/>}</button></td>;
          })}
        </tr>)}</tbody>
      </table></div>
    </section>
  </>;
}
