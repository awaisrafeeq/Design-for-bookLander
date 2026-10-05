import type { Book, Format, Post, StudioState, TeamMember } from './types';
export const BUSINESS_TIME_ZONE = 'America/New_York';
export const stages = [
  { id: 'idea', label: 'Ideas', who: 'both', hint: 'AI suggests. Team adds.' },
  { id: 'selected', label: 'Selected', who: 'team', hint: 'Team picks. Rest dropped.' },
  { id: 'generating', label: 'Generating', who: 'ai', hint: 'Video, image, caption.' },
  { id: 'review', label: 'Review', who: 'team', hint: 'Approve, revise, reject.' },
  { id: 'revision', label: 'Revision', who: 'both', hint: 'Edit, regenerate, return.' },
  { id: 'scheduled', label: 'Scheduled', who: 'auto', hint: 'Posts at the set time.' },
] as const;
export const formats: Record<Format, { label: string; icon: string; tool: string; cost: number }> = {
  video: { label: 'Video', icon: 'play', tool: 'Creatify', cost: 1.2 },
  carousel: { label: 'Carousel', icon: 'stack', tool: 'Predis', cost: .6 },
  image: { label: 'Image', icon: 'image', tool: 'Predis', cost: .3 },
};
export const sources = { calendar: { label: 'Calendar', icon: 'cal' }, news: { label: 'News', icon: 'news' }, team: { label: 'Team', icon: 'user' } };
export const owners = { ai: { label: 'AI', icon: 'spark' }, team: { label: 'Team', icon: 'user' }, both: { label: 'AI + Team', icon: 'spark' }, auto: { label: 'Automatic', icon: 'clock' } };
export const modules = ['Board', 'Ideas', 'Review', 'Schedule', 'Results', 'Sources', 'Brand', 'AI spend', 'Team', 'Logs'];
export const roles: Record<TeamMember['role'], string[]> = { 'Super admin': modules, 'Campaigns manager': ['Board', 'Ideas', 'Review', 'Schedule', 'Results', 'Sources', 'Brand', 'AI spend', 'Logs'], Approver: ['Board', 'Ideas', 'Review', 'Schedule', 'Results', 'Logs'], Editor: ['Board', 'Ideas', 'Schedule', 'Sources', 'Brand', 'Logs'], Viewer: ['Board', 'Schedule', 'Results'] };
export const revisionReasons = ['The copy', 'The look', 'Wrong title', 'Off brand', 'Something else'];
export const fallbackBook: Book = { id: 'team', title: 'Team topic', author: 'BookLender', colors: ['#44546A', '#F2F2F2', '#F2C14E'] };
export const getBook = (state: StudioState, id: string | null) => state.books[id || ''] || fallbackBook;
export const money = (n: number) => '$' + n.toFixed(2);
export const used = (state: StudioState) => state.spend.text + state.spend.video + state.spend.image;
export const spendStatus = (state: StudioState) => used(state) >= state.spend.cap ? 'stop' : used(state) / state.spend.cap >= .8 ? 'near' : 'ok';
export const atRisk = (post: Post) => !['published', 'archived', 'scheduled'].includes(post.stage) && post.eventDays != null && post.eventDays <= 3;
export const byTime = (a: Post, b: Post) => ((a.day || 0) - (b.day || 0)) || String(a.time).localeCompare(String(b.time));
export function formatEasternDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (key: string) => parts.find(item => item.type === key)?.value || '';
  return `${part('month')}/${part('day')}/${part('year')}`;
}
export function dayParts(offset = 0) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date());
  const value = (key: string) => Number(parts.find(part=>part.type===key)?.value);
  const date = new Date(Date.UTC(value('year'), value('month')-1, value('day')+offset, 12));
  return { wd: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }), d: date.getUTCDate(), m: date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) };
}
export function dayLabel(offset = 0) {
  if (!offset) return 'Today'; if (offset === 1) return 'Tomorrow'; if (offset === -1) return 'Yesterday';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date());
  const value = (key: string) => Number(parts.find(part => part.type === key)?.value);
  return formatEasternDate(new Date(Date.UTC(value('year'), value('month') - 1, value('day') + offset, 12)));
}
