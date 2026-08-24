/**
 * Demo entry point.
 *
 * Mounts the same `InkSession` the extension's content script mounts, over a
 * local page instead of a chat site. That is the point: if the session needed
 * anything host-specific, this would not work (NFR-10, NFR-15).
 *
 * Run with `npm run demo`, then open the page in a real browser window and draw
 * with the pen.
 */

import { InkSession } from '@overlay/session';

import { demoAdapter } from './demo-adapter';

const session = new InkSession({ adapter: demoAdapter });

// Stand-in for the host site's own send button. The extension never presses it
// — that is the entire point of FR-27, and the demo keeps the same boundary.
const send = document.querySelector<HTMLButtonElement>('#send');
const composer = document.querySelector<HTMLTextAreaElement>('#composer');
const sent = document.querySelector<HTMLParagraphElement>('#sent');

send?.addEventListener('click', () => {
  if (composer === null || sent === null) return;
  const text = composer.value.trim();
  sent.textContent =
    text === '' ? 'Nothing in the composer yet.' : `Sent ${text.split('\n').length} lines.`;
});

// Handy while tuning: expose the session so thresholds can be poked from the
// devtools console without a rebuild.
Object.assign(window, { inkSession: session });
