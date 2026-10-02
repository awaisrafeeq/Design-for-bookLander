export type Stage = 'idea' | 'selected' | 'generating' | 'review' | 'revision' | 'scheduled' | 'published' | 'archived';
export type Format = 'video' | 'carousel' | 'image';
export type Platform = 'Instagram' | 'Facebook';
export type Source = 'calendar' | 'news' | 'team';

export interface Post {
  id: number;
  title: string;
  book: string;
  author: string;
  cover: string;
  accent: string;
  source: Source;
  event: string;
  reason: string;
  format: Format;
  platform: Platform;
  stage: Stage;
  fit?: number;
  version?: number;
  cost?: number;
  caption?: string;
  script?: string;
  mediaBrief?: string;
  tags?: string;
  warning?: string;
  note?: string;
  scheduledAt?: string;
  error?: string;
  reach?: number;
  engagement?: number;
  clicks?: number;
  saves?: number;
  bookId: string | null;
  eventDays?: number;
  human?: boolean;
  day?: number;
  time?: string;
  approvedBy?: string;
  progress?: number;
  archiveReason?: string;
  history?: { version: number; reason: string; note: string }[];
  approvedVersion?: number;
  media?: { id: string; type: 'image' | 'video'; url: string; mime: string; size: number }[];
  platforms?: Platform[];
  brandChecks?: { policyVersion: number; passed: boolean; violations: { rule: string; match: string }[]; warnings: string[] };
  publicationStatus?: string;
  publicationTargets?: { id: string; platform: string; status: string; postUrl?: string; error?: string }[];
}

export interface Connection { id: string; name: string; purpose: string; connected: boolean; detail?: string }
export interface Event { id: number; name: string; source: Source; date: string; days: number; titles: number }
export interface BrandStyle { format: Format; name: string; guidance: string }
export interface TeamMember { id: number | string; name: string; initials: string; email: string; role: 'Super admin' | 'Campaigns manager' | 'Approver' | 'Editor' | 'Viewer'; modules: string[]; invited?: boolean; isApprover?: boolean; permissions?: Record<string, boolean>; roleTitles?: string[]; active?: boolean }
export interface Activity { id: number | string; at: string; actor: string; level: 'info' | 'success' | 'warning' | 'error'; message: string; detail?: string; cause?: string; fix?: string; connectionId?: string; done?: boolean; jobId?: string; status?: string; attempts?: number; providerJobId?: string; nextRetryAt?: string; result?: { credits?: number; model?: string; usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number } }; history?: { at: string; attempt: number; status: string; cause?: string }[] }
export interface Book { id: string; title: string; author: string; format?: string; stock?: number; colors: [string, string, string] }
export interface ResultMetrics {
  posts: number;
  kpi: Record<'reach' | 'impressions' | 'er' | 'clicks' | 'followers', [number, number]>;
  weeks: { label: string; value: number }[];
  byFormat: { format: Format; engagement: number }[];
  byPlatform: { platform: Platform; engagement: number }[];
  best: string;
  learned: { title: string; use: string }[];
}
export interface StudioState {
  modules?: string[];
  permissions?: Record<string, boolean>;
  accounts?: { id: string; platform: string; name: string; active: boolean; selected: boolean; syncedAt: string }[];
  posts: Post[];
  books: Record<string, Book>;
  spend: { cap: number; text: number; video: number; image: number; efficientModel: boolean; week: number[] };
  sources: Record<Source, boolean>;
  connections: Connection[];
  events: Event[];
  brand: { voice: string; never: string[]; styles: BrandStyle[]; reference: { postId: number; note: string } };
  team: TeamMember[];
  activity: Activity[];
  later: string[];
  news: { read: number; kept: number };
  summary: { ideas: number; picked: number; made: number; approved: number; published: number; errors: number };
  results: ResultMetrics;
  faq: { q: string; a: string }[];
  videos: { title: string; duration: string; bookId: string }[];
}
export interface ApiError { error: string }
