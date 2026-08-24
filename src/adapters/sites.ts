/**
 * The supported chat sites (FR-1).
 *
 * **Data only.** No DOM access and no imports from adapter code, because
 * `manifest.config.ts` imports this at build time to generate the host
 * allowlist. Anything that touches a browser API belongs in `generic.ts`.
 *
 * This is the single source for both the manifest's `content_scripts.matches`
 * and the adapter registry. They used to be separate lists, and the registry
 * carried a comment warning that adding a host to one without the other
 * silently did nothing — one chance to get it wrong per site. Deriving both
 * from here removes that failure entirely.
 */

export interface SiteConfig {
  /** Stable identifier, used in ids and logs. */
  readonly id: string;
  /** Display name. */
  readonly label: string;
  /**
   * Registrable domains. Each matches the bare domain and any subdomain, so
   * `deepseek.com` covers `chat.deepseek.com` without needing to know it —
   * pinning an exact subdomain once meant the extension never loaded at all.
   */
  readonly domains: readonly string[];
  /**
   * Extra fast-path selectors for an assistant turn, tried before the
   * structural fallback.
   *
   * Deliberately sparse. The DeepSeek selectors originally shipped here were
   * guesses that were never verified, and finding messages by shape is what
   * actually made the extension work. Adding guessed class names for five more
   * sites would repeat that, so per-site hints are only recorded when they are
   * known rather than assumed.
   */
  readonly messageSelectors?: readonly string[];
  /** Extra composer selectors, tried before the generic semantic ones. */
  readonly composerSelectors?: readonly string[];
}

export const SITES: readonly SiteConfig[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    domains: ['deepseek.com'],
    composerSelectors: ['textarea#chat-input'],
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    domains: ['chatgpt.com'],
    // This one is a real attribute ChatGPT renders, not a guess.
    messageSelectors: ['[data-message-author-role="assistant"]'],
    composerSelectors: ['#prompt-textarea'],
  },
  {
    id: 'claude',
    label: 'Claude',
    domains: ['claude.ai'],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    domains: ['gemini.google.com'],
  },
  {
    id: 'copilot',
    label: 'Copilot',
    domains: ['copilot.microsoft.com'],
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    domains: ['perplexity.ai'],
  },
];

/**
 * Whether a hostname belongs to this site.
 *
 * Suffix matching is anchored on a dot so it cannot be fooled by a lookalike:
 * `fakedeepseek.com` and `deepseek.com.attacker.test` both fail.
 */
export function siteMatchesHost(site: SiteConfig, hostname: string): boolean {
  const host = hostname.toLowerCase();
  return site.domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * Manifest match patterns for the given sites.
 *
 * Both forms are needed per domain: `https://*.example.com/*` does not match
 * the bare `example.com`.
 */
export function matchPatternsFor(sites: readonly SiteConfig[]): string[] {
  return sites.flatMap((site) =>
    site.domains.flatMap((domain) => [`https://${domain}/*`, `https://*.${domain}/*`]),
  );
}
