// @vitest-environment jsdom

/**
 * The manifest's host allowlist and the adapter registry are both generated
 * from `SITES`. These tests exist because they used to be separate lists, and
 * adding a host to one without the other silently produced either a site that
 * loads and does nothing, or an adapter that never runs.
 */

import { describe, expect, it } from 'vitest';

import { adapterFor, allAdapters } from './registry';
import { matchPatternsFor, siteMatchesHost, SITES } from './sites';

/** Does any manifest pattern cover this URL? */
function covered(patterns: readonly string[], url: string): boolean {
  const { hostname } = new URL(url);
  return patterns.some((pattern) => {
    const host = pattern.replace(/^https:\/\//, '').replace(/\/\*$/, '');
    return host.startsWith('*.') ? hostname.endsWith(host.slice(1)) : hostname === host;
  });
}

describe('SITES', () => {
  it('lists the six agreed chat sites', () => {
    expect(SITES.map((s) => s.id)).toEqual([
      'deepseek',
      'chatgpt',
      'claude',
      'gemini',
      'copilot',
      'perplexity',
    ]);
  });

  it('gives every site a unique id', () => {
    expect(new Set(SITES.map((s) => s.id)).size).toBe(SITES.length);
  });

  it('generates both the bare and wildcard pattern per domain', () => {
    // `https://*.example.com/*` does not match `example.com` itself, so a site
    // reachable at its apex would never load with only the wildcard form.
    const patterns = matchPatternsFor([{ id: 'x', label: 'X', domains: ['example.com'] }]);
    expect(patterns).toEqual(['https://example.com/*', 'https://*.example.com/*']);
  });

  it('never widens to all URLs', () => {
    // The allowlist must stay a list of named domains (NFR-6).
    for (const pattern of matchPatternsFor(SITES)) {
      expect(pattern).toMatch(/^https:\/\/(\*\.)?[a-z0-9.-]+\/\*$/);
    }
  });
});

describe('manifest and registry agree', () => {
  const patterns = matchPatternsFor(SITES);

  it('every site resolves to its own adapter AND is covered by the manifest', () => {
    // The regression test for the footgun. It fails if a site is added to
    // SITES but the registry ignores it, or vice versa.
    for (const site of SITES) {
      for (const domain of site.domains) {
        const url = `https://${domain}/chat`;
        expect(adapterFor(new URL(url))?.id, `${site.id} at ${domain}`).toBe(site.id);
        expect(covered(patterns, url), `${site.id} at ${domain}`).toBe(true);

        const sub = `https://app.${domain}/chat`;
        expect(adapterFor(new URL(sub))?.id, `${site.id} at app.${domain}`).toBe(site.id);
        expect(covered(patterns, sub), `${site.id} at app.${domain}`).toBe(true);
      }
    }
  });

  it('builds one adapter per site', () => {
    expect(allAdapters().map((a) => a.id)).toEqual(SITES.map((s) => s.id));
  });
});

describe('host matching', () => {
  it('rejects lookalike hostnames', () => {
    // Suffix matching is anchored on a dot, so a prefix or a longer suffix
    // must not qualify.
    for (const host of [
      'https://notdeepseek.com/',
      'https://fakedeepseek.com/',
      'https://deepseek.com.attacker.test/',
      'https://chatgpt.com.evil.test/',
      'https://fakeclaude.ai/',
      'https://example.com/chat',
    ]) {
      expect(adapterFor(new URL(host)), host).toBeNull();
    }
  });

  it('matches the apex domain and any subdomain', () => {
    const site = { id: 'x', label: 'X', domains: ['example.com'] };
    expect(siteMatchesHost(site, 'example.com')).toBe(true);
    expect(siteMatchesHost(site, 'chat.example.com')).toBe(true);
    expect(siteMatchesHost(site, 'EXAMPLE.COM')).toBe(true);
    expect(siteMatchesHost(site, 'notexample.com')).toBe(false);
  });
});
