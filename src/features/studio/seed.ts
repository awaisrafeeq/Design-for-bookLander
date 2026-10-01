import fixture from './fixtures/studio.json';
import type { StudioState } from './types';

/** Exact sample content from the supplied design, kept independent from React. */
export function createSeed(): StudioState {
  return structuredClone(fixture) as unknown as StudioState;
}
