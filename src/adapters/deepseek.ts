/**
 * DeepSeek adapter.
 *
 * Now a thin wrapper: everything it used to hold turned out to be
 * site-independent and lives in `generic.ts`, driven by the entry in
 * `sites.ts`. Only the hostname was ever DeepSeek-specific.
 *
 * Kept as a named module because DeepSeek is the site the extension was
 * developed and verified against, and its tests are the most thorough.
 */

import { createChatAdapter } from './generic';
import { SITES } from './sites';
import type { SiteAdapter } from './types';

const config = SITES.find((site) => site.id === 'deepseek');
if (config === undefined) throw new Error('ink-ink: no deepseek entry in SITES');

export const deepseekAdapter: SiteAdapter = createChatAdapter(config);

export { OPTION_PATTERNS } from './mcq-parser';
export { __stopStreamWatcher } from './generic';
