export const CACHE = {
  latest: 'public, max-age=120',
  openMonth: 'public, max-age=900',
  closedMonth: 'public, max-age=31536000, immutable',
  index: 'public, max-age=3600',
} as const;
