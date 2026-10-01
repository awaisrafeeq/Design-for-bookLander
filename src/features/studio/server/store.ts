import { createSeed } from '../seed';
import { formats, money, roles, used } from '../domain';
import type { Post, StudioState, TeamMember } from '../types';

// Demo API adapter: no database or external provider calls.
const state = createSeed();
let nextPostId = 100;
let nextActivityId = 100;
const clone = <T,>(data: T): T => structuredClone(data);
const log = (message: string, actor = 'You', level: 'info' | 'success' | 'warning' | 'error' = 'info') => state.activity.unshift({ id: nextActivityId++, at: 'Now', actor, level, message });
const postById = (id: number) => { const post = state.posts.find(item => item.id === id); if (!post) throw new Error('Post not found'); return post; };

export function readResource(resource: string) {
  if (resource === 'snapshot') return clone(state);
  if (['posts', 'ideas', 'review', 'schedule'].includes(resource)) return clone(state.posts);
  if (resource === 'dashboard') return clone({ posts: state.posts, spend: state.spend, connections: state.connections, activity: state.activity });
  if (resource === 'sources') return clone({ sources: state.sources, connections: state.connections, events: state.events });
  if (resource === 'brand' || resource === 'spend' || resource === 'team') return clone(state[resource]);
  if (resource === 'logs') return clone(state.activity);
  if (resource === 'results') return clone(state.results);
  throw new Error('Resource not found');
}
type Command = { action?: string; id?: number; title?: string; reason?: string; note?: string; caption?: string; tags?: string; scheduledAt?: string; value?: unknown; key?: string; role?: string; email?: string; name?: string; module?: string };
let reserved = 0;
function make(post: Post, revision = false) {
  if ((revision && post.stage !== 'review') || (!revision && post.stage !== 'selected')) throw new Error('Post is not ready for this action');
  if (revision && (post.version || 1) >= 3) throw new Error('3 versions used. Approve or reject this one.');
  const estimate = formats[post.format].cost + (state.spend.efficientModel ? .02 : .08);
  if (used(state) + reserved + estimate > state.spend.cap) throw new Error('Daily AI limit reached. Raise it in AI spend, or wait until tomorrow.');
  reserved += estimate;
  post.stage = revision ? 'revision' : 'generating'; post.progress = 15;
  post.version = revision ? (post.version || 1) + 1 : 1;
  if (!revision) state.summary.made++;
  setTimeout(() => {
    reserved = Math.max(0, reserved - estimate);
    if (!['generating', 'revision'].includes(post.stage)) return;
    const cost = Math.round(estimate * 100) / 100;
    post.cost = Math.round(((post.cost || 0) + cost) * 100) / 100;
    state.spend.text += state.spend.efficientModel ? .02 : .08;
    state.spend[post.format === 'video' ? 'video' : 'image'] += formats[post.format].cost;
    post.stage = 'review'; post.progress = 100;
    post.caption ||= `${post.title}. ${post.book} by ${post.author} is on the shelf. Rent it this week.`;
    post.tags ||= '#BookLender'; post.day ??= 3; post.time ||= '18:30';
    if (revision && post.warning) { post.caption = post.caption.replace(' in two days.', '.'); post.warning = undefined; }
    log(`Ready for review: ${post.title}. Cost ${money(cost)}.`, 'AI');
  }, 3200);
}

export function mutateResource(resource: string, input: Command): { message?: string } {
  if (resource === 'posts') {
    if (input.action === 'create') {
      const title = String(input.title || '').trim(); if (!title) throw new Error('Type a topic first.');
      state.posts.unshift({ id: nextPostId++, title, bookId: null, book: 'Team topic', author: 'BookLender', cover: '#44546A', accent: '#F2C14E', source: 'team', event: 'Team topic', eventDays: 14, reason: 'Added by you', format: 'image', platform: 'Instagram', stage: 'idea', fit: 3, human: true });
      log(`Added topic: ${title}`); return { message: 'Added to Ideas' };
    }
    if (input.action === 'generate-all') {
      const selected = state.posts.filter(post => post.stage === 'selected');
      if (selected.reduce((sum, post) => sum + formats[post.format].cost + .08, 0) + used(state) + reserved > state.spend.cap) throw new Error('Daily AI limit reached. Raise it in AI spend.');
      selected.forEach(post => make(post)); return { message: `Generating ${selected.length} posts` };
    }
    const post = postById(Number(input.id));
    let message = '';
    switch (input.action) {
      case 'pick': post.stage = 'selected'; state.summary.picked++; message = 'Picked. Generate it when ready.'; break;
      case 'skip': case 'reject': case 'archive': post.stage = 'archived'; post.archiveReason = input.action === 'reject' ? 'Rejected by you' : 'Skipped by you'; message = 'Moved to Archive'; break;
      case 'unpick': post.stage = 'idea'; message = 'Moved back to Ideas'; break;
      case 'restore': post.stage = 'idea'; post.archiveReason = undefined; post.eventDays = Math.max(post.eventDays || 7, 7); message = 'Back in Ideas'; break;
      case 'generate': make(post); message = 'Generating. Ready in a moment.'; break;
      case 'approve': if (post.stage !== 'review') throw new Error('Post is no longer in review'); post.stage = 'scheduled'; post.approvedBy = 'You'; state.summary.approved++; message = 'Approved. Added to the schedule.'; break;
      case 'revise': {
        const version = post.version || 1; make(post, true);
        post.history ||= []; post.history.push({ version, reason: input.reason || 'Something else', note: input.note || '' });
        message = `Sent to AI for version ${post.version}`; break;
      }
      case 'new-angle': post.title = `How we picked "${post.book}" for this`; post.reason = "Shows the team's reasoning, not just the pitch."; message = 'New angle: Behind the scenes'; break;
      case 'note': post.note = String(input.note || '').trim(); if (!post.note) throw new Error('Type your input first.'); message = 'Added. The AI uses this in the next version.'; break;
      case 'update': if (typeof input.caption === 'string') post.caption = input.caption; if (typeof input.tags === 'string') post.tags = input.tags; break;
      default: throw new Error('Unknown action');
    }
    log(`${input.action}: ${post.title}`, 'You', 'success'); return { message };
  }
  if (resource === 'sources') {
    if (input.action === 'toggle' && input.key && input.key in state.sources) state.sources[input.key as keyof StudioState['sources']] = Boolean(input.value);
    else if (input.action === 'reconnect') {
      const connection = state.connections.find(item => item.id === input.key); if (!connection) throw new Error('Connection not found');
      connection.connected = true; connection.detail = undefined;
      state.posts.forEach(post => { if (post.error && ((post.platform === 'Instagram' && input.key === 'ig') || (post.platform === 'Facebook' && input.key === 'fb'))) { post.error = undefined; post.time = '16:00'; } });
      state.activity.forEach(item => { if (item.connectionId === input.key) item.done = true; });
      log(`${connection.name} reconnected`, 'You', 'success'); return { message: `${connection.name} reconnected` };
    } else throw new Error('Unknown source command');
    return { message: 'Source updated' };
  }
  if (resource === 'brand') {
    if (input.key === 'voice') state.brand.voice = String(input.value || '');
    else if (input.action === 'add-rule') { const rule = String(input.value || '').trim(); if (!rule) throw new Error('Type a rule first.'); state.brand.never.push(rule); return { message: 'Rule added' }; }
    else if (input.action === 'remove-rule') state.brand.never.splice(Number(input.id), 1);
    else if (input.key?.startsWith('style:')) { const style = state.brand.styles.find(item => item.format === input.key?.split(':')[1]); if (!style) throw new Error('Style not found'); style.guidance = String(input.value || ''); }
    else throw new Error('Unknown brand setting');
    return {};
  }
  if (resource === 'spend') {
    if (input.key === 'cap') state.spend.cap = Math.max(1, Math.min(50, Math.round(Number(input.value) || 1)));
    else if (input.key === 'efficientModel') state.spend.efficientModel = Boolean(input.value);
    return {};
  }
  if (resource === 'team') {
    if (input.action === 'invite') {
      const email = String(input.email || '').trim(); if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a full email address.');
      const role = (input.role && input.role in roles ? input.role : 'Viewer') as TeamMember['role'];
      const raw = email.split('@')[0]; const name = raw.charAt(0).toUpperCase() + raw.slice(1);
      state.team.push({ id: Date.now(), name, initials: name.slice(0, 2).toUpperCase(), email, role, modules: [...roles[role]], invited: true });
      log(`Invited ${email} as ${role}`); return { message: `Invite sent to ${email}` };
    }
    const member = state.team.find(item => item.id === input.id); if (!member) throw new Error('Member not found');
    if (input.action === 'role' && input.role && input.role in roles) { member.role = input.role as TeamMember['role']; member.modules = [...roles[member.role]]; return { message: `${member.name.split(' ')[0]} is now ${member.role}` }; }
    if (input.action === 'access') {
      if (member.role === 'Super admin') throw new Error('Super admin always has full access.');
      const module = String(input.module); member.modules = member.modules.includes(module) ? member.modules.filter(item => item !== module) : [...member.modules, module]; return {};
    }
  }
  throw new Error('Unknown command');
}
