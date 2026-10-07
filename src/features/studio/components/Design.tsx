'use client';
import { useStudio } from './StudioProvider';
import { Icon } from './Icon';
import { atRisk, dayLabel, formats, getBook, money, owners, sources, spendStatus, used } from '../domain';
import type { Book, Post } from '../types';

export function Who({ kind }: { kind: keyof typeof owners }) { const owner = owners[kind]; return <span className={`who who-${kind}`}><Icon name={owner.icon}/>{owner.label}</span>; }
export function Chip({ children, tone = '' }: { children: React.ReactNode; tone?: string }) { return <span className={`chip ${tone}`}>{children}</span>; }
export function SourceChip({ post }: { post: Post }) { const source = sources[post.source]; return <Chip><Icon name={source.icon}/>{source.label}</Chip>; }
export function FormatChip({ post }: { post: Post }) { const format = formats[post.format]; return <Chip><Icon name={format.icon}/>{format.label}</Chip>; }
export function PlatformChip({ post }: { post: Post }) { return <Chip>{post.platform}</Chip>; }
export function DueChip({ post }: { post: Post }) { if (post.eventDays == null || ['scheduled','published','archived'].includes(post.stage)) return null; const days = post.eventDays; return <Chip tone={days <= 3 ? 'red' : days <= 7 ? 'amber' : ''}><Icon name="clock"/>{days === 0 ? 'Today' : days === 1 ? '1 day left' : `${days} days left`}</Chip>; }
export function VersionChip({ post }: { post: Post }) { return (post.version || 1) > 1 ? <Chip tone="amber">v{post.version}</Chip> : null; }
export function Meta({ post }: { post: Post }) { return <span className="meta"><Icon name={formats[post.format].icon}/>{formats[post.format].label}<i/>{post.platform}</span>; }
export function Meter() { const { state } = useStudio(); return <div className={`meter ${spendStatus(state)}`}><i style={{ width: `${Math.min(100, used(state) / state.spend.cap * 100)}%` }}/></div>; }
export function Cover({ bookId, book: suppliedBook }: { bookId?: string | null; book?: Book }) {
  const { state } = useStudio(); const book = suppliedBook || getBook(state, bookId || null);
  const [bg, fg, accent] = book.colors;
  const lines: string[] = []; let line = '';
  book.title.split(' ').forEach(word => { if (`${line} ${word}`.trim().length > 11 && line) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); }); if (line) lines.push(line);
  return <span className="cov"><svg viewBox="0 0 120 180" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${book.title} cover`}><rect width="120" height="180" fill={bg}/><rect width="7" height="180" fill="#000" opacity=".2"/><rect x="20" y="24" width="80" height="2" fill={accent}/>{lines.slice(0,4).map((text,i) => <text key={i} x="62" y={54+i*17} textAnchor="middle" fontFamily="Georgia,serif" fontSize="14" fontWeight="700" fill={fg}>{text}</text>)}<circle cx="62" cy={66+Math.min(lines.length,4)*17} r="8" fill="none" stroke={accent} strokeWidth="2"/><text x="62" y="160" textAnchor="middle" fontFamily="Georgia,serif" fontSize="9" fill={fg} opacity=".85">{book.author}</text></svg></span>;
}
function TextLines({ title, max, x, y, lineHeight, fill, fontSize }: { title: string; max: number; x: number; y: number; lineHeight: number; fill: string; fontSize: number }) {
  const lines: string[] = []; let line = ''; title.split(' ').forEach(word => { if (`${line} ${word}`.trim().length > max && line) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); }); if (line) lines.push(line);
  return <>{lines.slice(0,3).map((text,i) => <text key={i} x={x} y={y+i*lineHeight} textAnchor={x === 90 ? 'middle' : undefined} fontFamily={x === 90 ? 'sans-serif' : 'Georgia,serif'} fontSize={fontSize} fontWeight="700" fill={fill}>{text}</text>)}</>;
}
function NestedCover({ bookId, x, y, width, rotate = 0 }: { bookId: string | null; x: number; y: number; width: number; rotate?: number }) {
  const { state } = useStudio(); const book = getBook(state, bookId); const [bg,fg,accent] = book.colors; const height=width*1.5;
  const lines: string[]=[]; let line=''; book.title.split(' ').forEach(w=>{if(`${line} ${w}`.trim().length>11&&line){lines.push(line);line=w}else line=`${line} ${w}`.trim()});if(line)lines.push(line);
  return <g transform={`rotate(${rotate} ${x+width/2} ${y+height/2})`}><rect x={x+3} y={y+4} width={width} height={height} fill="#000" opacity=".25"/><svg x={x} y={y} width={width} height={height} viewBox="0 0 120 180"><rect width="120" height="180" fill={bg}/><rect width="7" height="180" fill="#000" opacity=".2"/><rect x="20" y="24" width="80" height="2" fill={accent}/>{lines.slice(0,4).map((t,i)=><text key={i} x="62" y={54+i*17} textAnchor="middle" fontFamily="Georgia,serif" fontSize="14" fontWeight="700" fill={fg}>{t}</text>)}<circle cx="62" cy={66+Math.min(lines.length,4)*17} r="8" fill="none" stroke={accent} strokeWidth="2"/><text x="62" y="160" textAnchor="middle" fontFamily="Georgia,serif" fontSize="9" fill={fg} opacity=".85">{book.author}</text></svg></g>;
}
export function Media({ post }: { post: Post }) {
  const { state } = useStudio(); const book = getBook(state,post.bookId); const [bg,fg,accent]=book.colors;
  if (['generating','revision'].includes(post.stage)) return <div className="media-loading" role="status"><span className="generation-spinner"/><b>Generating{post.generationKind === 'media' ? ' media' : ' content'}…</b><span className="small muted">Your new version will appear here when ready.</span></div>;
  if (post.media?.length) return <div className={`asset-preview ${post.format === 'carousel' ? 'carousel-assets' : ''}`}>{post.media.map(asset => asset.type === 'video'
    ? <video key={asset.id} controls playsInline preload="metadata" src={asset.url} aria-label={`${post.title} video`}/>
    : <img key={asset.id} src={asset.url} alt={post.title}/>)}</div>;
  if (!post.bookId) return <div className="empty asset-empty"><Icon name="image"/><span>No media attached</span></div>;
  if (post.format === 'video') return <svg viewBox="0 0 180 320" role="img" aria-label="Video preview"><rect width="180" height="320" fill={bg}/><rect width="180" height="320" fill="#000" opacity=".35"/><circle cx="90" cy="118" r="30" fill={fg} opacity=".92"/><path d="M28 262c0-44 28-72 62-72s62 28 62 72z" fill={fg} opacity=".92"/><NestedCover bookId={post.bookId} x={98} y={176} width={46} rotate={-6}/><rect x="12" y="12" width="40" height="18" rx="9" fill="#000" opacity=".55"/><text x="32" y="25" textAnchor="middle" fontFamily="sans-serif" fontSize="10" fill="#fff">0:28</text><rect x="14" y="272" width="152" height="40" rx="6" fill="#000" opacity=".65"/><TextLines title={post.title} max={22} x={90} y={287} lineHeight={15} fill="#fff" fontSize={11}/><circle cx="90" cy="160" r="20" fill="#fff" opacity=".9"/><path d="M84 150l16 10-16 10z" fill="#111"/></svg>;
  if (post.format === 'carousel') return <svg viewBox="0 0 200 250" role="img" aria-label="Carousel preview"><rect width="200" height="250" fill={fg}/><rect x="186" y="10" width="14" height="230" fill={accent} opacity=".5"/><TextLines title={post.title} max={18} x={18} y={34} lineHeight={19} fill={bg} fontSize={16}/><NestedCover bookId={post.bookId} x={40} y={97} width={84} rotate={4}/>{[0,1,2,3,4].map(i=><circle key={i} cx={80+i*10} cy="238" r="3" fill={bg} opacity={i ? .3 : 1}/>) }<text x="178" y="238" textAnchor="end" fontFamily="sans-serif" fontSize="9" fill={bg}>1/5</text></svg>;
  return <svg viewBox="0 0 200 250" role="img" aria-label="Image preview"><rect width="200" height="250" fill={bg}/><circle cx="160" cy="40" r="60" fill={accent} opacity=".25"/><NestedCover bookId={post.bookId} x={96} y={28} width={76} rotate={-5}/><TextLines title={post.title} max={20} x={16} y={204} lineHeight={18} fill={fg} fontSize={15}/><text x="16" y="36" fontFamily="sans-serif" fontSize="9" letterSpacing="1.5" fill={fg} opacity=".8">BOOKLENDER</text></svg>;
}
export function Header({ title, children }: { title: string; children?: React.ReactNode }) { return <div className="sechead"><h2>{title}</h2>{children}</div>; }
export function Empty({ title, detail }: { title: string; detail?: string }) { return <div className="card empty"><span className="ring"><Icon name="check"/></span><b>{title}</b>{detail && <span>{detail}</span>}</div>; }
export function PostRow({ post, onClick, trailing, className = '' }: { post: Post; onClick?: () => void; trailing?: React.ReactNode; className?: string }) { return <button className={`rowi ${className}`} onClick={onClick}><Cover bookId={post.bookId}/><span className="t"><b>{post.title}</b><small><Meta post={post}/><DueChip post={post}/><VersionChip post={post}/></small></span>{trailing}</button>; }
export function Risk({ post }: { post: Post }) { return atRisk(post) ? <Chip tone="red"><Icon name="clock"/>Due soon</Chip> : null; }
export { Icon, dayLabel, money };
