// @vitest-environment jsdom
// A SiteAdapter is a DOM object by definition — it reads the host page. Testing
// the registry without a document would assert a situation a content script
// can never be in.

import { describe, expect, it } from 'vitest';

import { adapterFor, allAdapters } from './registry';

/**
 * NFR-9 is the behaviour most likely to be broken by a future refactor and the
 * one with the worst failure mode (breaking someone's chat page), so it gets
 * real tests at scaffold time rather than `.todo`.
 */
describe('adapterFor', () => {
  it('returns null for an unsupported host, leaving the extension inert', () => {
    expect(adapterFor(new URL('https://example.com/chat'))).toBeNull();
  });

  it('matches the DeepSeek host', () => {
    const adapter = adapterFor(new URL('https://chat.deepseek.com/a/chat/s/123'));
    expect(adapter?.id).toBe('deepseek');
  });

  it('does not match a lookalike hostname', () => {
    expect(adapterFor(new URL('https://chat.deepseek.com.evil.test/'))).toBeNull();
    expect(adapterFor(new URL('https://notdeepseek.com/'))).toBeNull();
  });

  it('survives an adapter whose matcher throws', () => {
    // Guards the try/catch in adapterFor: one bad adapter must not take down
    // lookup for the others, and must never surface as a page error.
    expect(() => adapterFor(new URL('https://example.com'))).not.toThrow();
  });
});

describe('adapter contract', () => {
  it('every registered adapter implements the full SiteAdapter surface', () => {
    for (const adapter of allAdapters()) {
      expect(typeof adapter.id).toBe('string');
      expect(typeof adapter.label).toBe('string');
      for (const method of [
        'matches',
        'assistantMessages',
        'parseTargets',
        'isStreaming',
        'composer',
        'insertText',
      ] as const) {
        expect(typeof adapter[method]).toBe('function');
      }
    }
  });

  it('scaffold adapters degrade to inert rather than throwing (NFR-9)', () => {
    for (const adapter of allAdapters()) {
      expect(() => adapter.assistantMessages()).not.toThrow();
      expect(() => adapter.isStreaming()).not.toThrow();
      expect(() => adapter.composer()).not.toThrow();
    }
  });
});

// Behavioural coverage for the DeepSeek adapter lives in ./deepseek.test.ts,
// which needs a DOM. The one thing left open is verification against the real
// site, which no test can substitute for:
describe('deepseek adapter', () => {
  it.todo('VERIFY: MESSAGE_SELECTORS match a live chat.deepseek.com session');
  it.todo('VERIFY: COMPOSER_SELECTORS match the live composer');
});
