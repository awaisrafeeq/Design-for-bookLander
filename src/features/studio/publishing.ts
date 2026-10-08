import type { PublishingPlatform } from './types';

export const PUBLISHING_TARGETS: { name: PublishingPlatform; api: string }[] = [
  { name: 'Instagram', api: 'instagram' },
  { name: 'Facebook', api: 'facebook' },
  { name: 'LinkedIn', api: 'linkedin' },
  { name: 'Pinterest', api: 'pinterest' },
  { name: 'X', api: 'twitter' },
  { name: 'YouTube', api: 'youtube' },
  { name: 'TikTok', api: 'tiktok' },
];

export const publishingName = (api: string) => PUBLISHING_TARGETS.find(item => item.api === api)?.name || api;
